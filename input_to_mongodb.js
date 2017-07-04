const database = 'test2';
const dataFile = 'data1000';
const userName = 'admin';
const pwd = '123456';
var startTime = new Date();
var fs = require('fs');
var dataURL = '/home/lixing/Dropbox/thesis/documents/'+dataFile;
console.log('File path: '+dataURL);
// connection init
var MongoClient = require('mongodb').MongoClient,
	f = require('util').format,
	assert = require('assert');
var user = encodeURIComponent(userName),
	password = encodeURIComponent(pwd),
	authMechanism = 'DEFAULT',
	authSource = 'admin';
var ObjectId = require('mongodb').ObjectID;
// connection url
var url = f('mongodb://%s:%s@localhost:27017/'+database+'?authMechanism=%s&authSource=%s',
  user, password, authMechanism, authSource);

// read json file as a stream
const StreamArray = require('stream-json/utils/StreamArray');
const path = require('path');
let jsonStream = StreamArray.make();
const docs = [];
const diseaseCount = {};
//get json objects here
jsonStream.output.on('data', function ({index, value}) {
	// value is a patient's info
	console.log(index);
	docs.push(value);
	hospital = value['nearestHospital'];
	suburb = value['livingSuburb'];
	age = value['age'];
	treatments = value['treatments'];
	for(var i in treatments){
		treatment = treatments[i];
		disease = treatment['disease'];
		// construct disease data nodes
		if(!diseaseCount.hasOwnProperty(disease)){
			diseaseCount[disease] = {
				suburbs:{},hospitals:{},ageRanges:{},treatments:{}
			};
		}
		// construct medicine data nodes
		drugs = treatment['medicine'];
		for(var j in drugs){
			drug = drugs[j];
			itemCounts(diseaseCount[disease]['treatments'],drug);
		};
		itemCounts(diseaseCount[disease]['suburbs'],suburb);
		itemCounts(diseaseCount[disease]['hospitals'],hospital);
		itemCounts(diseaseCount[disease]['ageRanges'],ageRange(age));
		
		
	};
	//console.log(diseaseCount);
});

jsonStream.output.on('end', function () {
	// insert data to mongodb
	MongoClient.connect(url, function(err, db) {
		if(err) { 
			console.log('Unable to connect to the mongoDB server. Error:', err); 
		}
		else {
			console.log('Connection established to server!');
			console.log('Now Creating Disease Data...');
			for(var diseaseName in diseaseCount){
				var disease = {};
				disease['name'] = diseaseName;
				disease['class'] = 'disease';
				for(var prop in diseaseCount[diseaseName]){
					disease[prop] = diseaseCount[diseaseName][prop];
				};
				docs.push(disease);
			};
			console.log('Finished Creating Disease Data.');
			console.log('Now Inserting Documents to Database...')
			var cursor = db.collection('test').insertMany(docs,function(err,result){
				assert.equal(err, null);
				db.close();
				console.log('All done');
				var endTime = new Date();
				console.info("Execution time: %dms", (endTime-startTime));
			});
			
		};
	});
});
fs.createReadStream(dataURL).pipe(jsonStream.input);

function itemCounts(object,item){
	if(object.hasOwnProperty(item)){
		object[item] += 1;
	}else{
		object[item] = 1;
	}
}

function ageRange(age){
	if(age<10){
		range = '0-9';
	}else if(age.length>100){
		range = '>100';
	}else{
		age = age.toString();
		age = parseInt(age.slice(0,1));
		range = age.toString()+'0-'+age.toString()+'9';
	}
	return range
}