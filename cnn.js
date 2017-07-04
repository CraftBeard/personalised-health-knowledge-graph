var logger = require('tracer').console();
var fs = require('fs');
// MongoDB init
var MongoClient = require('mongodb').MongoClient,
	f = require('util').format,
	assert = require('assert');
var user = encodeURIComponent('admin'),
	password = encodeURIComponent('921201'),
	authMechanism = 'DEFAULT',
	authSource = 'admin',
	database = 'test2';
var ObjectId = require('mongodb').ObjectID;
// connection url
var url = f('mongodb://%s:%s@localhost:27017/'+database+'?authMechanism=%s&authSource=%s',
  user, password, authMechanism, authSource);

// convnetjs init
var convnetjs = require('convnetjs');
// species a 2-layer neural network with one hidden layer of 20 neurons
var layer_defs = [];
// input layer declares size of input. here: 2-D data
// ConvNetJS works on 3-Dimensional volumes (sx, sy, depth), but if you're not dealing with images
// then the first two dimensions (sx, sy) will always be kept at size 1
layer_defs.push({type:'input', out_sx:1, out_sy:1, out_depth:10});
// declare 10 neurons, followed by ReLU (rectified linear unit non-linearity)
layer_defs.push({type:'fc', num_neurons:20, activation:'relu'}); 
layer_defs.push({type:'fc', num_neurons:20, activation:'relu'}); 
// declare the linear classifier on top of the previous hidden layer
layer_defs.push({type:'softmax', num_classes:20});

var net = new convnetjs.Net();
net.makeLayers(layer_defs);
var trainer = new convnetjs.Trainer(net, {method: 'adadelta', l2_decay: 0.001,
	batch_size: 10});
var results = [];
var evaluation = {};
evaluation['correct'] = 0;
evaluation['total'] = 0;

logger.log(evaluation)

// connect to MongoDB
MongoClient.connect(url,function(err,db){
		if(err){
			console.log('Unable to connect to the mongoDB server. Error:', err); 
		}else{
			var cursor = db.collection('test').find({group:'patient'});
			cursor.each(function(err,doc){
				if(err){console.log(err)};
				if(doc!=null){
					results.push(doc);

				}else{
					if(results.length==0){
						db.close();
						logger.log('no such data');
					}else{
						db.close();
						logger.log('Now training...');
						for(var index=0;index<parseInt(results.length*0.7);index++){
							//logger.log(index);
							var result = results[index];
							var treatments = result['treatments'];
							var dob = parseInt(result.date_of_birth);
							var age = 2017-dob/10000;
							for(var i in treatments){
								treatment = treatments[i];
								medicalTests = treatment['test'];
								
								// get test results
								var testResults = [];
								testResults.push(age);
								for(var j in medicalTests){
									medicalTest = medicalTests[j];
									var testResult = medicalTest['result'];
									testResults.push(testResult);
								};

								if(testResults.length!=10){
									logger.log('length is not 10, but '+testResults.length)
								}
								
								// forward a data point through the network
								var test = new convnetjs.Vol(testResults);
								//var prob = net.forward(test); 

								// train the network
								drugs = treatment['treatment']
								for(var j in drugs){
									drug = drugs[j];
									classNum = parseInt(drug.replace('Treatment',''));
									if(typeof(classNum)!='number'){
										logger.log('not a number, but a '+typeof(classNum))
									}
									trainer.train(test, classNum-1);
								};
							};
						};
						
						logger.log('Now testing...');
						for(var index=parseInt(results.length*0.7);index<results.length;index++){
							//logger.log('testing '+index.toString()+'th');
							result = results[index];
							var treatments = result['treatments'];
							var dob = parseInt(result.date_of_birth);
							var age = 2017-dob/10000;
							for(var i in treatments){
								treatment = treatments[i];
								medicalTests = treatment['test'];
								evaluation['total'] += 1;
								
								// get test results
								var testResults = [];
								testResults.push(age);
								for(var j in medicalTests){
									medicalTest = medicalTests[j];
									var testResult = medicalTest['result'];
									testResults.push(testResult);
								}

								if(testResults.length!=10){
									logger.log('length is not 10, but '+testResults.length)
								}
								
								// forward a data point through the network
								var test = new convnetjs.Vol(testResults);
								var prob = net.forward(test); 
								var largest = Math.max.apply(Math, prob['w']);
								var largestIndex = prob['w'].indexOf(largest)+1;

								var drugs = treatment['treatment'];
								for(var j in drugs){
									drug = drugs[j];
									classNum = parseInt(drug.replace('Treatment',''));
									if(classNum==largestIndex){
										evaluation['correct'] += 1;
									};
								};
								
							};
						};

						logger.log(prob);
						logger.log(evaluation);

						logger.log('Now saving the network...');
						// network outputs all of its parameters into json object
						var json = net.toJSON();
						// the entire object is now simply string. You can save this somewhere
						var str = JSON.stringify(json);

						fs.writeFile("/home/lixing/Dropbox/thesis/public/cnnTreatment",
							str, function(err) {
							if(err) {return logger.log(err);}

							logger.log("The file was saved!");
						}); 

						var json = JSON.parse(str); // creates json object out of a string
						var net2 = new convnetjs.Net(); // create an empty network
						net2.fromJSON(json); // load all parameters from JSON

						logger.log(net2);
						logger.log('type of net2');
						logger.log(typeof(net2));
					};
				};
			});
		};
});
