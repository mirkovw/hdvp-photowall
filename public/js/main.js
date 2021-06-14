$(document).on('ready', function () {
    var imgFolder = 'img/photowall/';
    var d = new Date();
    console.log(d.getTime())
    var dataJson = 'data/data.json?d='+d.getTime();

    var checkJsonInterval = 3000; // interval to check json for updates
    var slideDelay = 1000; // delay after checkJson when the slides move. must be less than checkjson
    var slideSpeed = 1000;

    $.getJSON( dataJson, function( data ) {
        console.log('data loaded')
        var dividedData = divideToArrays(data.images);
        $.each( dividedData, function( key, val ) {
            slides = [];
            var sliderEl = "vertical-center-" + (key+1);
            for (var i=0; i<val.length; i++) {
                slides.push("<div><img src=" + imgFolder + val[i] + "></div>")
            }
            $( "."+sliderEl ).append( slides.join(""));
        });

    }).then( function(data) {
        // setting up the sliders
        var options = {
            dots: false,
            arrows: false,
            vertical: true,
            lazyLoad: 'ondemand',
            speed: slideSpeed,
            verticalSwiping: true,
            infinite: true,
            slidesToShow: 1,
        };
        $(".vertical-center-1").slick(options);
        $(".vertical-center-2").slick(options);
        $(".vertical-center-3").slick(options);

        $('.vertical-center-2').slick('slickGoTo', $('.vertical-center-2').slick('getSlick').slideCount - 1, true);

    }).then(function() {
        var checkJsonData = setInterval(function() {
            $.getJSON( dataJson, function( data ) {
                console.log('Checking data...')
                var dividedArrays = divideToArrays(data.images);
                for (var i=0; i<3; i++) {
                    var newImgs = dividedArrays[i].slice($('.vertical-center-'+(i+1)).slick('getSlick').slideCount)

                    $.each( newImgs, function( key, val ) {
                        console.log("Found new image!")
                        var sliderSelector = '.vertical-center-' + (i+1);
                        console.log('Adding to ' + sliderSelector)
                        var indexToAddSlide = $(sliderSelector).slick('getSlick').currentSlide;

                        if ($(sliderSelector).slick('getSlick').slideCount === 0) {
                            $(sliderSelector).slick('slickAdd','<div><img src='+ imgFolder + val +'></div>');
                            console.log('at no index in particular because its the first slide');
                        }

                        else {
                            $(sliderSelector).slick('slickAdd','<div><img src='+ imgFolder + val +'></div>', indexToAddSlide);
                            console.log('at this index: ' + indexToAddSlide);
                        }

                        console.log($(sliderSelector).slick('getSlick'));
                        var newSlideEl = $(sliderSelector).slick('getSlick').$slides[indexToAddSlide+1];
                        newSlideEl.style.opacity = 0;
                        $( newSlideEl).animate({ opacity: 1 }, 1000);
                    });
                }
            }).then(function(data) {
                var animateSliders = setTimeout(function() {
                    $(".vertical-center-1").slick('slickNext');
                    $(".vertical-center-3").slick('slickNext');
                    if ($('.vertical-center-2').slick('getSlick').currentSlide === 0) {
                        $('.vertical-center-2').slick('slickGoTo', $('.vertical-center-2').slick('getSlick').slideCount - 1, false);
                    }
                    else {
                        $(".vertical-center-2").slick('slickPrev');
                    }
                }, slideDelay)
            })
        }, checkJsonInterval)
    }).then(function() {});

    var divideToArrays = function(data) {
        var arrays = [[], [], []];
        targetArray = 0;

        for (var i = 0; i < data.length; i++) {
            arrays[targetArray].push(data[i]);
            targetArray = targetArray === 2 ? 0 : targetArray += 1;
        }
        return arrays;
    }
});