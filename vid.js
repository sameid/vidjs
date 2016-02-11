#!/usr/bin/env node

var express		= require('express');
var fs 			= require('fs');
var path 		= require('path');
var ip 			= require('ip');
var jade 		= require('jade');
var bytes 		= require('bytes');
var walk 		= require('walk');
var _			= require('underscore');


/****************
** INIT EXPRESS.JS
*****************/

var formats = ["webm", "mkv", "flv", "vob", "ogv", "ogg", "avi", "mov", "wmv", "mp4", "m4p", "m4v", "mpeg", "mpg", "m2v"];

var app = express();
var userArgs = process.argv.splice(2);
var PORT = 9000;

var files = new Array();

userArgs.forEach(function (arg) {
	if (fs.existsSync(arg) && fs.lstatSync(arg).isDirectory()) {
		var walker = walk.walk(arg, {followLinks: true});
		walker.on('file', function(root, stat, next){
			var f = {
				path: root + '/' + stat.name,
				name: stat.name,
				isDirectory: false
			}

			_.each(formats, function(format){
				if(stat.name.match("." + format)){
					files.push(f);
				}
			})
			next();
		});

		walker.on('end', function() {
			if (files.length == 0) {
				console.log('No files provided.');
				process.exit(0);
			}
			future();
		});
	}
});

var refreshFiles = function(callback){
	files = [];
	userArgs.forEach(function (arg) {
		if (fs.existsSync(arg) && fs.lstatSync(arg).isDirectory()) {
			var walker = walk.walk(arg, {followLinks: true});
			walker.on('file', function(root, stat, next){
				var f = {
					path: root + '/' + stat.name,
					name: stat.name,
					isDirectory: false
				}

				_.each(formats, function(format){
					if(stat.name.match("." + format)){
						files.push(f);
					}
				})
				next();
			});
			walker.on('end', function() {
				callback();
			});

		}
	});
}

var future = function(){
	app.set('port', process.env.PORT||PORT);
	app.set('view engine', 'jade');
	// Enable css links for jade
	app.use(express.static(__dirname));

	var localURL = ip.address()+':'+app.get('port');
	app.get('/', function (req, res) {
		res.render(__dirname+'/templates/index.jade', {
			localURL: localURL,
			files: files,
			ip: ip.address()
		});
	});

	var fileCache = {};

	app.get('/videostream/:number', function(req, res){
		var number = req.params.number;
		if (!isNaN(number) && number <= files.length-1) {
			var file = files[number];
			var name = file.name;
			var path = file.path;
			var stat = fs.statSync(path);
			var total = stat.size;
			if (req.headers['range']) {
				var range = req.headers.range;
				var parts = range.replace(/bytes=/, "").split("-");
				var partialstart = parts[0];
				var partialend = parts[1];

				var start = parseInt(partialstart, 10);
				var end = partialend ? parseInt(partialend, 10) : total-1;
				var chunksize = (end-start)+1;
				// console.log('RANGE: ' + start + ' - '   + end + ' = ' + chunksize);

				var _file = fs.createReadStream(path, {start: start, end: end}); //XXX this needs to be cached to avoid EMFILE error
				res.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/mp4' });

 				res.on('close', _file.destroy.bind(_file));

				_file.pipe(res);
			} else {
				// console.log('ALL: ' + total);
				res.writeHead(200, { 'Content-Length': total, 'Content-Type': 'video/mp4' });
				fs.createReadStream(path).pipe(res);
			}
		}
		else {
			res.redirect('/');
		}
	})

	app.get('/show/:number', function (req, res) {
		var number = req.params.number;
		if (!isNaN(number) && number <= files.length-1) {
			res.render(__dirname+"/templates/video.jade", {
				localURL: localURL,
				file: files[number],
				videoIndex: number
			})
		} else {
			res.redirect('/');
		}
	});

	app.get('/refresh/', function(req, res){
		refreshFiles(function(){
			res.redirect('/');
		});
	})

	var server = app.listen(PORT, function() {
		console.log('Vidjs at '+ip.address()+':'+app.get('port'));
	});
}

// Catch errors where the port is already in use
process.on('uncaughtException', function(err) {
	if(err.errno === 'EADDRINUSE')
	console.log('This port is already in use.');
	else
	console.log(err);
	process.exit(1);
});
