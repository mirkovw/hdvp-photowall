const nodemailer = require("nodemailer");
const SMTPServer = require("smtp-server").SMTPServer;
const parser = require("mailparser").simpleParser;
const fs = require('fs').promises;
const createReadStream = require('fs').createReadStream;
const sharp = require('sharp');
const legit = require('legit');
const express = require('express');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const config = require('config');
const chokidar = require('chokidar');
const aws = require("@aws-sdk/client-ses");

const smtp_listen_port = config.get('mail.port');
const web_port = config.get('web.port');
const web_server = express();

const publicFolder = path.join(__dirname, "../public/")
const jsonDataPath = path.join(__dirname, "../public/data/data.json")
const tempImgFolder = path.join(__dirname, "../public/img/photowall_temp/")
const imgFolder = path.join(__dirname, "../public/img/photowall/")

const watcher = chokidar.watch(imgFolder, {
    ignored: /^\./,
    persistent: true,
    ignoreInitial: true
});
//const watcher = chokidar.watch(imgFolder);



const smtp_server = new SMTPServer({
    onConnect(session, callback) {
        console.log("Incoming connection")
        console.log(session)

        return callback();
    },
    onData(stream, session, callback) {

        parser(stream, {}, async (err, parsed) => {

            let response = 'Please only send photos to this email address. Thank you!';

            if (err) console.log("Error:" , err)

            console.log('Data received');

            try { // try parsing data first
                const date = new Date();
                console.log('Current time: ' + date);
                console.log('Sent time: ' + parsed.date);
                console.log('To: ' + parsed.to.text);
                console.log('From: ' + parsed.from.text);
                console.log('Subject: ' + parsed.subject);

                if (parsed['attachments'].length > 0) { //check for attachments
                    console.log('Attachments: ' + parsed['attachments'].length);

                    const attachment = parsed['attachments'][0]; // we're only doing the first attachment

                    try { // write attachment
                        console.log('Ok, so we got an attachment.');

                        if (attachment.contentType === 'image/jpeg' || attachment.contentType === 'image/png' || attachment.contentType === 'image/webp') {
                            let imagePath = await writeAttachment(attachment);
                            const imageValid = await checkImage(imagePath);

                            if (imageValid) {
                                imagePath = await moveImage(imagePath, imgFolder);
                                await updateDataJson();

                                console.log("Attachment has been resized, checked, moved and added to JSON.");
                                response = 'Your image has been added to the photowall and will be visible shortly. Thank you!<br>The images will be deleted after the event concludes.';
                            }

                            else {
                                console.log('Image was flagged by Sightengine');
                                response = 'The image you sent through was deemed inappropriate by our software. Please select another image and try again.';
                            }

                        } else {
                            console.log("Wrong attachment type.");
                            response = 'Please only send JPG/PNG/WEBP images to this address.';
                        }

                    } catch (err) {
                        console.log('Error writing attachment');
                        response = 'We were unable to process your image. Please try again with a different image.';
                        console.log(err);
                    }
                }
            }

            catch (err) {
                console.log('error parsing data.');
                response = 'We were unable to process your email. Please try again with a different client.';
            }

            await replyTo(parsed, response);

            return callback();
        })

        stream.on("end", function() {
            console.log('stream ended?')
        })

    },
    disabledCommands: ['AUTH']
});

const getNewFilename = async () => {
    console.log('Getting new filename')
    const d = new Date();
    const timeStamp = d.getTime();
    const newFilename = 'img_' + timeStamp +  '_id1_id2.webp';
    const newImagePath = path.join(tempImgFolder, newFilename)

    console.log('Ok new filename is ' + path.basename(newImagePath));
    console.log('And the path is ' + newImagePath)
    return newImagePath;
}

const writeAttachment = async (attachment) => {
    console.log('Ok got an attachment: ' + attachment)
    const imgFilePath = await getNewFilename();
    console.log('Writing to temp folder...')
    const image = await sharp(attachment.content).resize(800).toFile(imgFilePath);
    console.log('Done. image details:');
    console.log(image);
    return imgFilePath;
}

const checkImage = async (imagePath) => {
    console.log('checking ' + imagePath + ' , seeing if image is SFW');
    console.log('Is SFW, good to go!')

    const data = new FormData();
    data.append('media', createReadStream(imagePath));
    data.append('models', config.get('sightEngine.models'));
    data.append('api_user', config.get('sightEngine.api_user'));
    data.append('api_secret', config.get('sightEngine.api_secret'));

    console.log('sending to sightengine...')
    try {
        const result = await axios.post('https://api.sightengine.com/1.0/check.json', data, {headers: data.getHeaders()})
        console.log(result.data);
        if (result.data.nudity.raw < 0.1 && result.data.weapon < 0.1 && result.data.drugs < 0.1 && result.data.offensive.prob < 0.1) {
            return true;
        }
        else {
            return false;
        }
    } catch(err) {
        console.log('error');
    }
}

const moveImage = async(imagePath, imgFolder) => {
    const oldPath = imagePath;
    const newPath = path.join(imgFolder, path.basename(oldPath));
    console.log('moving ' + oldPath);
    console.log('to ' + newPath);
    await fs.rename(oldPath, newPath);
}

const updateDataJson = async () => {
    console.log('Updating data JSON file')
    const imgDirContents = await fs.readdir(imgFolder);

    const imgArray = imgDirContents.filter(file => {
        if (file != '.gitignore') {
            return file;
        }
    })

    let jsonData = {};
    jsonData.images = imgArray;
    await fs.writeFile(jsonDataPath, JSON.stringify(jsonData, null, 2));
}


const replyTo = async (parsed, response) => {
    const email = parsed.from.value[0].address;

    if (email === 'photos@hdvp.nl' || email === 'foto@hdvp.nl') {
        console.log('message was sent from photos/foto@hdvp.nl which will cause a loop. Aborting..');
        return;
    }

    console.log('this email was:')
    console.log('from: ');
    console.log(parsed.from.value);
    console.log('to: ');
    console.log(parsed.to.value);
    console.log('reply-to: ' + parsed['reply-to']);
    console.log('message id: ' + parsed.messageId);

    const mailOptions = {
        from: config.get('mail.from'),
        to: parsed.from.text,
        subject: 'RE: ' + parsed.subject,
        text: response,
        html: response,
        inReplyTo: parsed.messageId,
        references: parsed.messageId
    };

    const transporter = await nodemailer.createTransport({
        host: config.get('mail.smtp.host'),
        port: config.get('mail.smtp.port'),
        auth: config.get('mail.smtp.auth'),
        dkim: config.get('mail.dkim')
    });

    await transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}


( async () => {
    web_server.use(express.static(publicFolder));
    await updateDataJson();

    smtp_server.listen(smtp_listen_port);
    console.log('SMTP server listening on ' + smtp_listen_port);

    web_server.listen(web_port, ()=> {
        console.log('Web server listening on ' + web_port);
    })

    watcher.on('unlink', async function(path) {
        console.log('File', path, 'has been removed');
        await updateDataJson();
    })

})();