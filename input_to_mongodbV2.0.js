const database = 'thesis'
const dataFile = 'data1000'
var startTime = new Date();
var fs = require('fs');
var logger = require('tracer').console();
var dataURL = '/home/lixing/Dropbox/thesis/documents/'+dataFile;
console.log('File path: '+dataURL);

// connection MongoDB init
var MongoClient = require('mongodb').MongoClient,
	f = require('util').format,
	assert = require('assert');
var user = encodeURIComponent('admin'),
	password = encodeURIComponent('921201'),
	authMechanism = 'DEFAULT',
	authSource = 'admin';
var ObjectId = require('mongodb').ObjectID;
// MongoDB connection url
var url = f('mongodb://%s:%s@localhost:27017/'+database+'?authMechanism=%s&authSource=%s',
  user, password, authMechanism, authSource);

// word frequency init
var natural = require('natural'),
	tokenizer = new natural.WordTokenizer();
var stopword = require('stopword');


// read json file as a stream
const StreamArray = require('stream-json/utils/StreamArray');
//const path = require('path');
let jsonStream = StreamArray.make();
const docs = [];
const diseaseFreq = {};
const diseaseSummary = {};	//used to calculate frequency of recovery, reappear, occurence
diseaseSummary['recovery']={};
diseaseSummary['reappear']={};
diseaseSummary['duration']={};
const appliedTreatments = {};
const wordFreq = {}; // used to store diseases and word frequency of their procedures and diagnosis
const diseaseTreatments = {};
const diseaseSymptoms = {};
const ageFreq = {}, genderFreq = {}, addressFreq = {}, jobFreq = {};

//get individual json objects here
jsonStream.output.on('data', function ({index, value}) {
	// value is a patient's info {}
	console.log(index);
	value['date_of_birth'] = changeBirthday(value['date_of_birth']);
	docs.push(value);
	var treatments = value['treatments'];
	var age = 2017 - value.date_of_birth/10000;
	var ageRange = age.toString()[0]+'0-'+(parseInt(age.toString()[0])+1).toString()+'0';
	var gender = value.gender;
	var address = value.address.city;
	var job = value.job_title;
	for(var i in treatments){
		treatment = treatments[i];

		diagnoses = treatment['diagnosis'];

		// calculate ocurrences of diseases
		for(var j in diagnoses){
			var diagnosis1 = diagnoses[j];
			itemCounts(diseaseFreq,diagnosis1,1);
			for(var k in diagnoses){
				diagnosis2 = diagnoses[k];
				if(diagnosis1!=diagnosis2 && k>j){
					itemCounts(diseaseFreq,diagnosis1+' '+diagnosis2,1);
				}
			};

			var diagnosis = diagnoses[j];
			// calculate frequency of age, gender, address, job
			dictInit([ageFreq,genderFreq,addressFreq,jobFreq],diagnosis);
			itemCounts(ageFreq[diagnosis], ageRange, 1);
			itemCounts(genderFreq[diagnosis], gender, 1);
			itemCounts(addressFreq[diagnosis], address, 1);
			itemCounts(jobFreq[diagnosis], job, 1);

			// calculate frequency of symptoms
			var symptoms = treatment.symptom;
			for(var k in symptoms){
				var symptom = symptoms[k];
				if(!diseaseSymptoms.hasOwnProperty(diagnosis)){
					diseaseSymptoms[diagnosis] = {};
				}
				itemCounts(diseaseSymptoms[diagnosis],symptom,1);
			}

			// calculate the word frequency of procedures and diagnoses
			drugs = treatment['treatment'];
			for(var l in drugs){
				drug = drugs[l];
				if(!diseaseTreatments.hasOwnProperty(diagnosis)){
					diseaseTreatments[diagnosis] = {};
				}
				itemCounts(diseaseTreatments[diagnosis],drug,1);
			}

			
			diagDesc = treatment['diagnosis_description'];
			procDesc = treatment['procedure_description'];

			// tokenizing
			tokensDiag = tokenizer.tokenize(diagDesc);
			tokensProc = tokenizer.tokenize(procDesc);
			// removing stop words
			tokensDiag = stopword.removeStopwords(tokensDiag);
			tokensProc = stopword.removeStopwords(tokensProc);
			// stemming
			for(var l in tokensDiag){
				token = natural.PorterStemmer.stem(tokensDiag[l]);
				if(!wordFreq.hasOwnProperty(diagnosis)){
					wordFreq[diagnosis] = {};
				}
				itemCounts(wordFreq[diagnosis],token,1);
			}
			for(var l in tokensProc){
				var token = natural.PorterStemmer.stem(tokensProc[l]);
				if(!wordFreq.hasOwnProperty(diagnosis)){
					wordFreq[diagnosis] = {};
				}
				itemCounts(wordFreq[diagnosis],token,1);
			}

		};

		// calculate frequency of treatments 
		var medicines = treatment['treatment'];
		for(var k in medicines){
			var medicine = medicines[k];
			itemCounts(appliedTreatments,medicine,1);
		}
	};

	// calculate frequency of recovery and reappear
	results = recoveryAndReappear(treatments);
	recovery = results['recovery'];
	reappear = results['reappear'];
	duration = results['duration'];
	for(var disease in recovery){
		itemCounts(diseaseSummary['recovery'],disease,recovery[disease]);
	}
	for(var disease in reappear){
		itemCounts(diseaseSummary['reappear'],disease,reappear[disease]);	
	}
	for(var disease in duration){
		if(!diseaseSummary['duration'].hasOwnProperty(disease)){
			diseaseSummary['duration'][disease]=[];
		}
		for(var d in duration[disease]){
			diseaseSummary['duration'][disease].push(duration[disease][d]);
		}
	}
});

jsonStream.output.on('end', function () {
	// insert data to mongodb
	MongoClient.connect(url, function(err, db) {
		if(err) { 
			console.log('Unable to connect to the mongoDB server. Error:', err); 
		}
		else {
			console.log('Connection established to server!');
			console.log('Now Creating Diseases Nodes...');
			var probability = {};
			// calculate conditional probability of different disease
			for(var diagnosis in diseaseFreq){
				if(diagnosis.indexOf(' ')==-1 ){
					if(!probability.hasOwnProperty(diagnosis)){probability[diagnosis]={}};
					probability[diagnosis][diagnosis] = diseaseFreq[diagnosis];
				}else{
					diags = diagnosis.split(' ');
					if(!probability.hasOwnProperty(diags[0])){probability[diags[0]]={}};
					if(!probability.hasOwnProperty(diags[1])){probability[diags[1]]={}};
					probability[diags[0]][diagnosis] = diseaseFreq[diagnosis];
					probability[diags[1]][diagnosis] = diseaseFreq[diagnosis];
				}
			};
			// calculate duration
			for(var disease in diseaseSummary['duration']){
				diseaseSummary['duration'][disease] = calculateArray(diseaseSummary['duration'][disease]);
			}
			//console.log(probability)
			//console.log(JSON.stringify(docs[0],null,2))
			for(var disease in probability){
				docs.push({id:disease,name:disease,group:'disease',
					frequency:probability[disease],
					recovery:diseaseSummary['recovery'][disease],
					recurrence:diseaseSummary['reappear'][disease],
					duration:diseaseSummary['duration'][disease],
					wordFrequency:wordFreq[disease],
					treatmentFrequency:diseaseTreatments[disease],
					symptomFrequency:diseaseSymptoms[disease],
					ageFreq:ageFreq[disease],
					genderFreq:genderFreq[disease],
					addressFreq:addressFreq[disease],
					jobFreq:jobFreq[disease]
				});
			}

			for(var medicine in appliedTreatments){
				docs.push({id:medicine,name:medicine,group:'treatment',
				frequency:appliedTreatments[medicine]})
			}
			//console.log(JSON.stringify(docs[0],null,2));
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

// start creating stream
fs.createReadStream(dataURL).pipe(jsonStream.input);

function itemCounts(object, item, addValue) {
	if (object.hasOwnProperty(item)) {
		object[item] += addValue;
	}else{
		object[item] = addValue;
	}
}

// expected input data = [{diagnosis:[],test:[{},{},{}],date:...},{}]
// return {recovery:{'obesity':100,...},reappear:{'obesity':15,...},duration:{'obesity':[3,5,..]}}
function recoveryAndReappear(data){
	limit = {
		BMI:30,
		SBP:140,
		HBA1C:6.5,
		Cholesterol:240,
	}

	// diseaseTable contains binary data
	// diseaseTable = {Diabetes:[1,0,1,0,0,0,0...],...}
	var diseaseTable = {};
	diseaseTable['Obesity']=[];
	diseaseTable['Hypertension']=[];
	diseaseTable['Hyperlipidemia']=[];
	diseaseTable['Diabetes']=[];

	// convert raw data into binary data
	// 0: not ill, 1: ill
	for(var index in data){
		treatment = data[index];
		testData = treatment.test;
		for(var i in testData){
			test = testData[i];
			if(test.type=='BMI'){
				if(test.result>=limit['BMI']){
					diseaseTable['Obesity'].push(1)
				}else{
					diseaseTable['Obesity'].push(0)
				}
			}else if(test.type=='SBP'){
				if(test.result>=limit['SBP']){
					diseaseTable['Hypertension'].push(1)
				}else{
					diseaseTable['Hypertension'].push(0)
				}
			}else if(test.type=='HBA1C'){
				if(test.result>=limit['HBA1C']){
					diseaseTable['Diabetes'].push(1)
				}else{
					diseaseTable['Diabetes'].push(0)
				}	
			}else if(test.type=='Cholesterol'){
				if(test.result>=limit['Cholesterol']){
					diseaseTable['Hyperlipidemia'].push(1)
				}else{
					diseaseTable['Hyperlipidemia'].push(0)
				}	
			}
		}
	}
	var recovery = {},
		reappear = {},
		duration = {};
	for(var disease in diseaseTable){
		var durationCount = 0;
		var durationStart = 0;
		var testResult = diseaseTable[disease];
		var illBefore = 'False';
		for(var i=0;i<testResult.length-1;i++){
			if(testResult[i]>testResult[i+1]){
				itemCounts(recovery,disease,1);
				illBefore = 'True';
				durationCount = i - durationStart;
				if(!duration.hasOwnProperty(disease)){
					duration[disease] = [];
				}
				duration[disease].push(durationCount);
			}else if(testResult[i]<testResult[i+1]){
				if(illBefore == 'True'){
					itemCounts(reappear,disease,1);
				}
				durationStart = i;
			}
		}
	}

	results = {recovery:recovery,reappear:reappear,duration:duration};
	return results
}

function calculateArray(array){
	var sum = 0;
	for(var i in array){
		sum += array[i];
	}
	return {sum:sum,length:array.length}
}

function changeBirthday(birthday){
	date = birthday.split('/');
	year = parseInt(date[2]);
	month = parseInt(date[1]);
	day = parseInt(date[0]);
	return year*10000+month*100+day
}

function wordFreqCalculator(obj,str){

}

function dictInit(dicts, element){
	for(var i in dicts){
		var dict = dicts[i];
		if(!dict.hasOwnProperty(element)){
			dict[element] = {};
		}
	}
}