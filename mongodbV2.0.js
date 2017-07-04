var logger = require('tracer').console();
var fs = require('fs');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var urlencodedParser = bodyParser.urlencoded({ extended: false });

// connection init
var MongoClient = require('mongodb').MongoClient,
	f = require('util').format,
	assert = require('assert');
var user = encodeURIComponent('admin'),
	password = encodeURIComponent('921201'),
	authMechanism = 'DEFAULT',
	authSource = 'admin',
	database = 'thesis';
var ObjectId = require('mongodb').ObjectID;
// connection url
var url = f('mongodb://%s:%s@localhost:27017/'+database+'?authMechanism=%s&authSource=%s',
  user, password, authMechanism, authSource);


app.use(express.static('public'));
app.use(bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
	extended: false
})); 

app.get('/', function (req, res) {
	res.sendFile( __dirname + "/" + "phkgV2.0.html" );
	console.log('Successfully sent phkg.html!');
})

app.post('/findPatient',function(req,res){
	var patientID = req['body']['patientID'];
	while(patientID.length < 5){
		patientID = '0'+patientID;
	}
	if(patientID.indexOf('P')==-1){
		patientID = 'P'+patientID;
	};
	patient = [patientID]
	findData(patient,'id',res);
});

app.post('/findDisease',function(req,res){
	var diseaseName = req['body']['diseaseName'];
	disease = [diseaseName]
	findData(disease,'disease',res);
})

app.post('/findRelatedNodesOfPatients',function(req,res){
	var disease = req['body']['disease[]'];
	//console.log(req['body']);
	findData(disease,'disease',res);	
})

app.post('/similarPatients',function(req,res){
	var birthday = req.body.birthday;
	var gender = req.body.gender;
	var aggregateCmd = {};
	var aggregateCmds = [];
	aggregateCmd['$match'] = {};
	aggregateCmd['$match']['$and'] = [];
	var range = {};
	range['date_of_birth'] = {};
	range['date_of_birth']['$gte'] = (parseInt(birthday.substr(0,4))-3)*10000;
	range['date_of_birth']['$lte'] = (parseInt(birthday.substr(0,4))+3)*10000;
	aggregateCmd['$match']['$and'].push(range);
	aggregateCmd['$match']['$and'].push({gender:gender});
	aggregateCmds.push(aggregateCmd);
	aggregateData(aggregateCmds,res);
})

app.post('/patientSummary',function(req,res){
	var age = req.body.age;
	var gender = req.body.gender;
	var aggregateCmds = [];
	// match patients with same age and gender
	var aggregateCmd = {};
	aggregateCmd['$match'] = {};
	aggregateCmd['$match']['$and'] = [];
	aggregateCmd['$match']['$and'].push({age:parseInt(age)});
	aggregateCmd['$match']['$and'].push({gender:gender});
	aggregateCmds.push(aggregateCmd);
	// project data
	var aggregateCmd = {};	
	aggregateCmd['$project'] = {};
	aggregateCmd['$project']['_id'] = 0;
	aggregateCmd['$project']['treatments'] = 1;
	aggregateCmds.push(aggregateCmd);
	aggregateData(aggregateCmds,res);
})

app.get('/totalNumberOfPatients',function(req,res){
	var aggregateCmds = [];
	var aggregateCmd = {};
	aggregateCmd['$match'] = {};
	aggregateCmd['$match']['group'] = 'patient';
	aggregateCmds.push(aggregateCmd);
	var aggregateCmd = {};
	aggregateCmd['$group'] = {};
	aggregateCmd['$group']['_id'] = 'null';
	aggregateCmd['$group']['totalPatients'] = {};
	aggregateCmd['$group']['totalPatients']['$sum'] = 1;
	aggregateCmds.push(aggregateCmd);
	aggregateData(aggregateCmds,res);
})

app.get('/getAllTreatment',function(req,res){
	MongoClient.connect(url,function(err,db){
		if(err){
			console.log('Unable to connect to the mongoDB server. Error:', err); 
		}else{
			var findSth = {};
			findSth['group'] = 'treatment';
			cursor = db.collection('test').find(findSth);
			var result = [];
			cursor.each(function(err,doc){
				if(err){console.log(err)};
				if(doc!=null){
					result.push(doc);
				}else{
					if(result.length==0){
						db.close();
						res.json('no such data');
					}else{
						db.close();
						res.json(result);
					}
				}
			})
		}
	})
	
});

app.get('/getCNN',function(req,res){
	fs.readFile("/home/lixing/Dropbox/thesis/public/cnnTreatment","utf8",
		function(err,data){
		if(err){logger.log(err)};
		//logger.log(data);
		//logger.log(typeof(data));
		res.json(data);
	});
})

app.post('/patientPrediction',function(req,res){
	var age = parseInt(req.body.age);
	var gender = req.body.gender;
	var suburb = req['body']['livingSuburb'];
	var aggregateCmds = [];
	// match patients with same age, gender and living suburb
	var aggregateCmd = {};	
	aggregateCmd['$match'] = {};
	aggregateCmd['$match']['$and'] = [];
	var andCmd = {};
	andCmd['$gte'] = age;
	andCmd['$lte'] = age+5;
	aggregateCmd['$match']['$and'].push({age:andCmd});
	aggregateCmd['$match']['$and'].push({gender:gender});
	aggregateCmd['$match']['$and'].push({livingSuburb:suburb});
	aggregateCmds.push(aggregateCmd);
	// project data
	var aggregateCmd = {};	
	aggregateCmd['$project'] = {};
	aggregateCmd['$project']['_id'] = 0;
	aggregateCmd['$project']['treatments'] = 1;
	aggregateCmds.push(aggregateCmd);
	// unwind treatments
	var aggregateCmd = {};	
	aggregateCmd['$unwind'] = '$treatments';
	aggregateCmds.push(aggregateCmd);
	aggregateData(aggregateCmds,res);
})

app.get('/getAllDisease',function(req,res){
	MongoClient.connect(url,function(err,db){
		if(err){
			console.log('Unable to connect to the mongoDB server. Error:', err); 
		}else{
			var findSth = {};
			findSth['group'] = 'disease';
			cursor = db.collection('test').find(findSth);
			var result = [];
			cursor.each(function(err,doc){
				if(err){console.log(err)};
				if(doc!=null){
					result.push(doc);
					//console.log(doc);
				}else{
					if(result.length==0){
						db.close();
						res.json('no such data');
					}else{
						db.close();
						res.json(result);
					}
				}
			})
		}
	})
})

var findData = function(dataList,propertyName,res){
	if(propertyName=='disease'){propertyName='name'}
	MongoClient.connect(url, function(err, db) {
		if(err) { 
			console.log('Unable to connect to the mongoDB server. Error:', err); 
		}
		else {
			var findSth = {};
			findSth[propertyName] = {};
			findSth[propertyName]['$in'] = [];
			for(var i in dataList){
				findSth[propertyName]['$in'].push(dataList[i]);
			}
			var cursor = db.collection('test').find(findSth);
			var result = [];
			cursor.each(function(err,doc){
				if(err){console.log(err)};
				if(doc!=null){
					//console.log(doc['id']);
					result.push(doc);
				}else{
					if(result.length==0){
						db.close();
						res.json('no such data');
					}else{
						db.close();
						res.json(result);
					}
					
				}
			});
		};
	});	
}

function aggregateData(aggregateCmds,res){
	MongoClient.connect(url, function(err, db) {
		if(err) { 
			console.log('Unable to connect to the mongoDB server. Error:', err); 
		}
		else {
			var cursor = db.collection('test').aggregate(aggregateCmds);
			var result = [];
			cursor.each(function(err,doc){
				if(err){console.log(err)};
				if(doc!=null){
					//console.log(doc['id']);
					result.push(doc);
				}else{
					if(result.length==0){
						db.close();
						res.json('no such data');
					}else{
						db.close();
						res.json(result);
					}
				}
			})
		}
	})
}

var server = app.listen(8081, function () {
		var host = server.address().address
		var port = server.address().port
		console.log("listen on: http://localhost:8081")
})