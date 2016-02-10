var Server = require('karma').Server;
var util = require('gulp-util');
var gulp = require('gulp');
var path = require('path');
var glob = require('glob');
var _ = require('lodash');

var error = require('../util/error');
var test = require('../../test/test');
var config = require('../../app/config.js');
var deps = require('../deps')(config);

var isTestDebug = util.env.d || util.env.debug;
var testRequirements = isTestDebug ? [] : ['buildTest'];
var itemInChunk = util.env['items-in-chunk'] || 10;
var karmaConf = require('../../test/karma.conf.js');

gulp.task('test', testRequirements, function (done) {
    // Need for get expelled tests from karma.conf.js
    var config = {};
    config.set = function(obj) {
        this.conf = obj;
    };
    karmaConf(config);
    var karmaConfExcludeTests = config.conf.exclude || [];

    var cliOptions = _.cloneDeep(util.env);
    var modulesToTest = [];
    var currentChunk = 0;

    var sourcesList = deps.getJSFiles({source: 'testSource'}).concat([
        'gulp/tmp/testJS/config.js',
        'gulp/tmp/testJS/projectList.js',
        'gulp/tmp/testJS/templates.js',
        'node_modules/leaflet/spec/after.js',
        'node_modules/happen/happen.js',
        'node_modules/mock-geolocation/dist/geolocate.js',
        'test/after.js'
    ]);

    if ('m' in cliOptions) {
        modulesToTest = cliOptions.m.split(',');
    }

    if ('module' in cliOptions) {
        modulesToTest = cliOptions.module.split(',');
    }

    var modulesToTestSourceList = [];

    if (modulesToTest.length) {
        modulesToTest.forEach(function (moduleName) {
            modulesToTestSourceList = modulesToTestSourceList.concat(glob.sync('src/' + moduleName + '/test/*Spec.js'));
        });
    } else {
        modulesToTestSourceList = modulesToTestSourceList.concat(glob.sync('src/**/test/*Spec.js'));
    }
    modulesToTestSourceList = modulesToTestSourceList.concat(glob.sync('node_modules/leaflet/spec/suites/**/*Spec.js'));

    modulesToTestSourceList = _.xor(modulesToTestSourceList, karmaConfExcludeTests);

    var splittedModules = _.chunk(modulesToTestSourceList, itemInChunk);

    var numberOfChunks = splittedModules.length;

    console.log("\nITEMS IN CHUNK: " + itemInChunk + ". Use --items-in-chunk for set this.");
    console.log("NUMBER OF CHUNKS: " + numberOfChunks);

    var totalErr = false;

    var startServer = function(err){
        totalErr = err || totalErr;
        console.log('\nCHUNK #' + currentChunk.toString());

        var localeSourceList = sourcesList.concat(splittedModules[currentChunk]);
        currentChunk++;

        localeSourceList.push('node_modules/leaflet/spec/suites/SpecHelper.js');

        new Server({
            files: localeSourceList,
            configFile: path.join(__dirname, '../../test/karma.conf.js'),
            browsers: test.getBrowsers(),
            reporters: test.getReporters(isTestDebug),
            junitReporter: test.getJunitReporter(),
            action: 'run',
            preprocessors: {
                'gulp/tmp/testJS/src/**/*.js': ['coverage']
            },
            singleRun: true
        }, currentChunk == numberOfChunks ? function(){
            if (totalErr) {
                process.exit(1);
            }
            else {
                done();
            }
        } : startServer).start();
    };
    startServer();
});
