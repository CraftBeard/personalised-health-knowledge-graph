//"use strict";
$(document).ready(function(){
	// post query to MongoDB
	$('#search-button').click(function(){
		const patientID = $('#search-query').val();
		const fromTime = $('#from-time').val();
		const toTime = $('#to-time').val();
		// fetch patient data from MongoDB
		$.post('/findPatient',{patientID:patientID},
			function(data,status){
				//console.log(data);
				window.patientData = data;
				var plotData = periodOfPatient(fromTime,toTime,data);
				var graph = graphOnPatient(plotData);
				$('#info').html('');
				//$('#info').css('width','40%');
				$('#info2').html('');
				//$('#info2').css('width','20%');
				plotNetworkGraphV2(graph);
				plotPatientInfo(plotData);
				plotComparison(data);
				plotHealthChart(plotData);
				
				
		})
	})

	// remove treatments that are not in the specified period of time
	function periodOfPatient(fromTime,toTime,patientData){
		var data = {};
		data.treatments = [];
		for(var key in patientData[0]){
			if(key == 'treatments'){
				for(var j in patientData[0].treatments){
					var treatment = patientData[0].treatments[j];
					if(treatment.date>fromTime*10000 && treatment.date<toTime*10000){
						data.treatments.push(treatment);
					}
				}
			}else{
				data[key] = patientData[0][key];
			}
		}
		return [data]
	}

	// calculate frequency of a disease, treatments = []
	function diseaseFreq(diseaseName,treatments){
		var freq = 0;
		for(var i in treatments){
			var treatment = treatments[i];
			// treatment['diagnosis'] = []
			for(var j in treatment['diagnosis']){
				var diagnosis = treatment['diagnosis'][j];
				if(diagnosis==diseaseName){
					freq += 1;
				}
			}
		}
		return freq
	}

	// construct a graph over the data of the patient
	// expected input data=[{id:xxx,name:xxx,...}]
	function graphOnPatient(data){
		console.log(data);
		var nodes = [],
			links = [];
		var diseaseFreq = {};
		var patient = data[0];
		// add patient to nodes
		var patientName = patient.name;
		nodePush(patient.id,patientName,'patient',50,nodes);
		// add disease to nodes and links
			//calculate frequency of diseases
		for(var i in patient.treatments){
			var treatment = patient.treatments[i];
			for(var j in treatment['diagnosis']){
				var diagnosis = treatment['diagnosis'][j];
				if(diagnosis.indexOf('Risk')!=-1){
					var diagnosis = diagnosis.split('Of');
					itemCounts(diseaseFreq,diagnosis[1],2);
				}else{
					itemCounts(diseaseFreq,diagnosis,5);
				};
			};
		};

		for(var disease in diseaseFreq){
			//nodePush(id,displayName,group,size,nodeList)
			nodePush(disease,disease,'disease',diseaseFreq[disease],nodes);
			
			// distance: the shorter, the more possible
			//linkPush(source,target,value,distance,type,linkList)
			linkPush(patient.id,disease,diseaseFreq[disease],
				1/diseaseFreq[disease],'pd',links);
		};

		var graph = {nodes:nodes,links:links};
		//console.log(graph);
		return graph
	}

	// construct a graph over the data of the disease
	// expected input data=[{id:xxx,name:xxx,...}]
	function graphOnDisease(data){
		console.log(data);
		var diseaseName = data.name;
		var nodes = [],
			links = [];

		nodePush(diseaseName,diseaseName,'disease',40,nodes);

		// wait for fecthed data
		$.ajax({
			url:'/findDisease',
			type:'POST',
			data: {diseaseName:diseaseName},
			async:false,
			success:function(data){
				// add symptom nodes and symptom-disease links
				var symptomFreq = data[0].symptomFrequency;
				for(var symptom in symptomFreq){
					nodePush(symptom,symptom,'symptom',symptomFreq[symptom],nodes);
					linkPush(diseaseName,symptom,symptomFreq[symptom],
						1/symptomFreq[symptom],'ds',links);
			5};

				// add disease nodes and calculate Baysian Probability
				var frequency = data[0].frequency;
				var freqB = frequency[diseaseName];
				for(var f in frequency){
					if(f.indexOf(' ')>0 && f.indexOf('RiskOf')<0 && f!=diseaseName){
						for(var index in f.split(' ')){
							var e = f.split(' ')[index];
							if(e!=diseaseName){
								nodePush(e,e,'disease',frequency[f],nodes);
								var freqAB = frequency[f];
								var conProbA = freqAB/freqB;
								linkPush(diseaseName,e,conProbA,1/conProbA,'dd',links);
							}
						}
					}
				}
			}
		})

		graph = {nodes:nodes,links:links};
		return graph
	}

	// construct a graph over the data of the symptom
	// expected input data=[{id:xxx,name:xxx,...}]
	function graphOnSymptom(data){
		console.log(data);
		
	}

	// plot line chart and fingerprint heath chart
	function plotHealthChart(data){
		var healthIndices = {};		// indices of each year
		var patient = data[0];
		var patientName = patient.name;
		var treatments = patient.treatments;		// array

		// calculate health status index and polynomial regression based on this patient
		var trainData = {};
		var mostRecentYear = 0;
		for(var i in treatments){
			var healthIndex = {};	// expected healthIndices = {2017:xx,2016:xx...}
			var treatment = treatments[i];
			var year = parseInt(treatment.date/10000);
			if(year > mostRecentYear){
				mostRecentYear = year;
			}
			var tests = treatment.test;		//array
			for(var j in tests){
				var test = tests[j];		//object
				healthIndex[test.type] = test.result;

				if(!trainData.hasOwnProperty(test.type)){
					trainData[test.type] = [];
				};
				trainData[test.type].push([year, test.result]);

			}
			var index = healthEvaluation(healthIndex);
			// only keep year
			var date = parseInt(treatment.date.toString().substr(0,4));
			healthIndices[date] = index;
		}

		var predictData = {};
		predictData.thisPatient = {};
		predictData.similarPatients = {};
		for(var type in trainData){
			var regData = trainData[type];
			var result = regression('polynomial', regData, 4);
			var equation = result.equation;
			
			for(var i = mostRecentYear+1; i < mostRecentYear+4; i ++){
				var sum = 0;
				for(var j in equation){
					sum += (equation[j] * Math.pow(i,j));
				}

				if(!predictData.thisPatient.hasOwnProperty(i)){
					predictData.thisPatient[i] = {};
				}

				predictData.thisPatient[i][type] = sum;

			}
		}

		// polynomial regression based on similar patients
		var similarPatients = knnPatients(patient,window.similarPatients,10);
		console.log(similarPatients)
		
		var trainData = {};
		for(var i in similarPatients){
			var patient = similarPatients[i].patient[0];
			var treatments = patient.treatments;
			for(var j in treatments){
				var treatment = treatments[j];
				var year = parseInt(treatment.date/10000);
				var tests = treatment.test;
				for(var k in tests){
					var test = tests[k];
					if(!trainData.hasOwnProperty(test.type)){
						trainData[test.type] = [];
					}
					trainData[test.type].push([year, test.result]);
				}
			}
		}		
		
		for(var type in trainData){
			var regData = trainData[type];
			var result = regression('polynomial', regData, 4);
			var equation = result.equation;
			for(var i = mostRecentYear+1; i < mostRecentYear+4; i ++){
				var sum = 0;
				for(var j in equation){
					sum += (equation[j] * Math.pow(i,j));
				}

				if(!predictData.similarPatients.hasOwnProperty(i)){
					predictData.similarPatients[i] = {};
				}
				predictData.similarPatients[i][type] = sum;
			}
		}

		// add predicted indices
		for(var year in predictData.thisPatient){
			healthIndices[year] = Number((1/2 * healthEvaluation(predictData.thisPatient[year]) +
				1/2 * healthEvaluation(predictData.similarPatients[year])).toFixed(2));
		}

		plotLineChart(healthIndices,
			'info','healthIndex',patientName+'\'s Health Status',0.4);
		var plotData = fingerprint(data,predictData);
		plotFingerprint(plotData,
			'info','fingerprint',patientName+'\'s Health Fingerprint',0.6);
	}

	// expected testResults = {BMI:xx,SBP:xx,...}
	function healthEvaluation(testResults){
		var evaluation = 0;
		range = {
			BMI:[18.5,25,30],
			SBP:[90,120,140],
			DBP:[60,80,90],
			FBS:[70,100,126],
			HBA1C:[4,5.7,6.5],
			Cholesterol:[200,240],
			Triglyceride:[150,200],
			HDLC:[60,40],
			LDLC:[100,160]
		}
		for(var test in testResults){
			if(test == 'HDLC'){
				var hdlc = testResults.HDLC;
				evaluation += hdlc >= range.HDLC[0] ? 3 : (
					hdlc < range.HDLC[1] ? 0 : 2 );
			}else if(range[test].length==2){
				var result = testResults[test];
				evaluation += result >= range[test][2] ? 0 : (
					result < range[test][0] ? 3 : 2);
			}else{
				var result = testResults[test];
				evaluation += result >= range[test][2] ? 0 : (
					result < range[test][0] ? 2 : (
						result >= range[test][1] ? 2 : 3));
			}
		};
		// evaluation is an index of health
		return evaluation
	}

	// plot health index line chart
	// expected input data={x1:y1,x2:y2,...}
	function plotLineChart(data,position,divID,title,heightProportion){
		var xAxisData = [],
			yAxisData = [],
			healthLine = [];
		for(var x in data){
			xAxisData.push(x);
			yAxisData.push(data[x]);
			healthLine.push(27);
		};

		// prepare a DOM to plot line chart
		var box = document.getElementById(position).getBoundingClientRect(),
			width = box.width,
			height = box.height*heightProportion;
		var chartDiv = document.createElement('div');
		$(chartDiv)
			.attr('id',divID)
			.css('width',width).css('height',height)
			.appendTo($('#'+position));

		var chart = echarts.init(document.getElementById(divID));
		var option = {
			title: {
				text: title,
				left: 'center'
			},
			tooltip: {
				trigger: 'item',
				formatter: '{a} <br/>{b} : {c}'
			},
			legend: {
				orient: 'vertical',
				left: 'right',
				//bottom:'bottom',
				data: ['Health Line', 'Health Index']
			},
			xAxis: {
				type: 'category',
				name: 'Year',
				splitLine: {show: false},
				data: xAxisData
			},
			grid: {
				left: '3%',
				right: '4%',
				bottom: '3%',
				containLabel: true
			},
			yAxis: {
				type: 'value',
				name: 'Health Index'
			},
			series: [
				{
					name: 'Health Line',
					type: 'line',
					data: healthLine
				},
				{
					name: 'Health Index',
					type: 'line',
					data: yAxisData
				}
			]
		};
		chart.setOption(option);
	}

	// expected input data is the information of a patient
	function fingerprint(data,predictData){
		var patient = data[0];
		var treatments = patient.treatments;
		//allYearTestData = {2017:{BMI:25,SBP:124,...},2016:{},...}
		var allYearTestData = {};
		for(var i in treatments){
			var treatment = treatments[i];
			var year = parseInt(treatment.date.toString().substr(0,4));
			if(!allYearTestData.hasOwnProperty(year)){allYearTestData[year] = {}};
			var tests = treatment.test;
			for(var j in tests){
				var test = tests[j];
				var testName = test.type;
				var testResult = test.result;
				allYearTestData[year][testName] = testResult;
			};
		}
		// add predicted data in allYearTestData
		for(var year in predictData.thisPatient){
			if(!allYearTestData.hasOwnProperty(year)){allYearTestData[year] = {}};
			for(var type in predictData.thisPatient[year]){
				if(type=='BMI' || type=='HBA1C'){
					var fixedNum = 1;
				}else{
					var fixedNum = 0;
				}
				allYearTestData[year][type] = (1/2*predictData.thisPatient[year][type]+
					1/2*predictData.similarPatients[year][type]).toFixed(fixedNum);
				
			}
		}
		var xAxis = [],
			yAxis = [],
			plotData = [];
		for(var year in allYearTestData){
			xAxis.push(year);
			if(yAxis.length<1){
				for(var test in allYearTestData[year]){
					yAxis.push(test);
				};
			};
		};
		for(var year in allYearTestData){
			for(var test in allYearTestData[year]){
				plotData.push([xAxis.indexOf(year),
					yAxis.indexOf(test),
					allYearTestData[year][test],
					fingerprintColor(test,allYearTestData[year][test])]);
			};
		}
		
		return {xAxis:xAxis,yAxis:yAxis,plotData:plotData}
	};

	function fingerprintColor(test,value){
		range = {
			BMI:[18.5,25,30],
			SBP:[90,120,140],
			DBP:[60,80,90],
			FBS:[70,100,126],
			HBA1C:[4,5.7,6.5],
			Cholesterol:[200,240],
			Triglyceride:[150,200],
			HDLC:[60,40],
			LDLC:[100,160]
		}
		// red:3,yellow:2,green:1
		if(test=='HDLC'){
			standard = range[test];
			return value>=standard[0]?1:(value>=standard[1]?2:3)
		}else if(range[test].length==2){
			standard = range[test];
			return value>=standard[1]?3:(value>=standard[0]?2:1)
		}else if(range[test].length==3){
			standard = range[test];
			return value>=standard[2]?3:(value>=standard[1]?2:(value>=standard[0]?1:2))
		}
	}

	// expected input data={xAxis:[],yAxis:[],plotData:[[x,x,x],[x,x,x],...]}
	function plotFingerprint(data,position,divID,title,heightProportion){
		//console.log(data)
		// prepare a DOM to plot prediction
		var box = document.getElementById(position).getBoundingClientRect(),
		width = box.width,
		height = box.height*heightProportion;
		chartDiv = document.createElement('div');
		$(chartDiv)
			.attr('id',divID)
			.css('width',width).css('height',height)
			.appendTo($('#'+position));

		chart = echarts.init(document.getElementById(divID));
		option = {
			title:{
				text:title,
				left:'center'
			},
			tooltip: {
				position: 'top',
				formatter:function(obj){
					var value = obj.value;
					return 'Value: '+value[2]
				}
			},
			animation: false,
			grid: {
				height: '50%',
				y: '10%'
			},
			xAxis: {
				type: 'category',
				data: data.xAxis,
				splitArea: {
					show: true
				}
			},
			yAxis: {
				type: 'category',
				data: data.yAxis,
				splitArea: {
					show: true
				}
			},
			visualMap: {
				min:1,
				max:3,
				calculable: true,
				orient: 'horizontal',
				left: 'center',
				bottom: '15%',
				//green:#23bc35,yellow:#f2c43a,red:#e0623c
				color:['#e0623c','#f2c43a','#23bc35']
			},
			series: [{
				name: 'Biomedical Parameters',
				type: 'heatmap',
				data: data.plotData,
				label: {
					normal: {
						show: true
					}
				},
				itemStyle: {
					emphasis: {
						shadowBlur: 10,
						shadowColor: 'rgba(0, 0, 0, 0.5)'
					}
				}
			}]
		};
		chart.setOption(option);
	}

	// plot histogram, expected input data={xAxis:[],yAxis:[],plotData:[[x,x,x],[x,x,x],...]}
	function plotHistogram(data,position,divID,title,legend,heightProportion){
		// prepare a DOM to plot histogram
		var box = document.getElementById(position).getBoundingClientRect(),
		width = box.width,
		height = box.height*heightProportion;
		chartDiv = document.createElement('div');
		$(chartDiv)
			.attr('id',divID)
			.css('width',width).css('height',height)
			.appendTo($('#'+position));

		chart = echarts.init(document.getElementById(divID));

		option = {
			title : {
				text: title.title,
				subtext:title.subtitle,
				left: 'center'
			},
			tooltip : {
				trigger: 'axis'
			},
			legend: {
				data:legend,
				bottom:'bottom'
			},
			calculable : true,
			xAxis : data.xAxis,
			yAxis : data.yAxis,
			series : data.series
		}; 

		chart.setOption(option);
	}

	// plot prediction of diseases
	function plotComparison(data){

		var patientName = data[0].name;
		var diseaseFreq = {};
		// calculate frequency of diseases
		treatments = data[0].treatments;
		for(var i in treatments){
			treatment = treatments[i];
			diagnoses = treatment['diagnosis'];
			for(var j in diagnoses){
				diagnosis = diagnoses[j];
				itemCounts(diseaseFreq,diagnosis,1);
			}
		};
		//console.log(diseaseFreq)
		var birthday = data[0]['date_of_birth'];
		var gender = data[0]['gender'];
		var diseaseFreqSim = {};

		// find simimlar patients
		$.ajax({
			url:'/similarPatients',
			type:'POST',
			data:{birthday:birthday,gender:gender},
			async:false,
			success:function(data,status){
				//console.log(data);
				window.similarPatients = data;
				var patientNum = data.length;
				for(var i in data){
					patient = data[i];
					treatments = patient.treatments;
					for(var j in treatments){
						treatment = treatments[j];
						diagnoses = treatment['diagnosis'];
						for(var k in diagnoses){
							diagnosis = diagnoses[k];
							itemCounts(diseaseFreqSim,diagnosis,1);
						}
					};
				}
				//console.log(diseaseFreqSim)

				var legend = [patientName,'Average'];
				var title = {};
				title.title = 'Health Comparison';
				title.subtitle = 'Compared to Similar Patients';
				var position = 'info2';
				var divID = 'diseasePrediction';
				var heightProportion = 0.5;
				var yAxisData = [];
				var patientSeries = [];
				var averageSeries = [];
				//console.log(diseaseFreq)
				//console.log(diseaseFreqSim)
				for(var disease in diseaseFreq){
					if(disease.indexOf('RiskOf')<0){
						yAxisData.push(disease);
						patientSeries.push(diseaseFreq[disease]);
						if(diseaseFreqSim.hasOwnProperty(disease)){
							averageSeries.push((diseaseFreqSim[disease]/patientNum).toFixed(2));	
						}else{
							averageSeries.push(0);
						}
						
					};
				};
				var plotData = {};
				plotData.xAxis = [{type:'value',boundaryGap : [0, 0.01]}];
				plotData.yAxis = [
					{
						type : 'category',
						data : yAxisData,
						textStyle:{fontSize:5}
					}
				];
				plotData.series = [
					{
						name:patientName,
						type:'bar',
						data: patientSeries
					},
					{
						name:'Average',
						type:'bar',
						data: averageSeries
					}
				];
				plotHistogram(plotData,position,divID,title,legend,heightProportion);
			}
		});
	}

	// plot patient information
	function plotPatientInfo(data){
		var box = document.getElementById('info2').getBoundingClientRect(),
		width = box.width,
		height = box.height*0.46;
		chartDiv = document.createElement('div');
		$(chartDiv)
			.attr('id','patientInfo')
			.css('width',width).css('height',height)
			.appendTo($('#info2'));
		$('#patientInfo').css('overflow','auto');

		var plotData = [];
		patient = data[0];
		for(var key in patient){
			if(key!='treatments' && key!='_id'){
				value = patient[key];
				if(key=='address'){
					value = patient['address']['city']+', '+patient['address']['state'];
				}else if(key=='date_of_birth'){
					value = value.toString();
					value = value.substr(6,2)+'/'+value.substr(4,2)+'/'+value.substr(0,4)
				}
				plotData.push({property:key.toUpperCase(),value:value});
			}
		}
		tabulate(plotData,['property','value'],'Patient Info','patientInfo')
	}

	// expected input data=[{property:xx,value:xx},{}]
	function tabulate(data, columns, caption,position) {
			var table = d3.select('#'+position)
				.append('table')
				.attr('class','table table-striped table-hover');
				
				table.append('caption')
				.attr('style','text-align:center')	// put text in the center
				.text(caption);

			var	tbody = table.append('tbody');
			// create a row for each object in the data
			var rows = tbody.selectAll('tr')
				.data(data)
				.enter()
				.append('tr');

			// create a cell in each row for each column
			var cells = rows.selectAll('td')
				.data(function (row) {
					return columns.map(function (column) {
							return {column: column, value: row[column]};
						}
					);
				})
				.enter()
				.append('td')
				.text(function (d) { return d.value; });

			return table;
		}

	function itemCounts(object, item, addValue) {
		if (object.hasOwnProperty(item)) {
			object[item] += addValue;
		}else{
			object[item] = addValue;
		}
	}

	function linkPush(source,target,value,distance,type,linkList){
		var link={};
			link.source = source;
			link.target = target;
			link.type = type;
			link.value = value;
			link.distance = distance;
			if(!contains(linkList,link,'links')){
				linkList.push(link);
			}
	}

	function nodePush(id,displayName,group,size,nodeList){
		var node = {};
		node.id = id;
		node.group = group;
		node.size = size;
		node.name = displayName;
		if(!contains(nodeList,node,'nodes')){
			nodeList.push(node);
		}
	}

	function contains(list,obj,linksOrNodes){
		for(var i=0; i<list.length; i++){
			if(linksOrNodes=='links'){
				if (list[i].source==obj.source && list[i].target==obj.target) {
					return true;
				}
			}else if(linksOrNodes=='nodes'){
				if (list[i].id==obj.id){
					return true;
				}
			};
		}
		return false;
	}

	// use neural network and the occurence in similar patients to predict the best treatment
	function plotRecommendation(data){
		var box = document.getElementById('info2').getBoundingClientRect(),
			width = box.width,
			height = box.height*0.4
			newDiv = document.createElement('div');
		$(newDiv)
			.attr('id','recommendation')
			.css('width',width).css('height',height)
			.appendTo($('#info2'));

		$('#recommendation').css('overflow','auto');

		var disease = data[0];
		var diseaseName = disease.name;

		var patientData = window.patientData[0];
		var treatments = patientData.treatments; // an array of objects
		// sort treatments by date
		treatments.sort(function(a,b){return (a.date>b.date)?-1:((a.date<b.date)?1:0);});
		var lastTreatment = treatments[0];
		var lastTests = lastTreatment.test;
		var lastTestResults = [];
		var age = 2017-patientData.date_of_birth/10000;
		lastTestResults.push(age);
		for(var i in lastTests){
			lastTestResults.push(lastTests[i].result);
		};

		$('#recommendation').html('<h4 align="center">Recommended Treatments for '+diseaseName+'</h4>');

		$.ajax({
			url:'/getCNN',
			type:'GET',
			dataType:'json',
			success:function(data){
				//console.log(data);
				// recreate neural network from json file
				var json = JSON.parse(data); // creates json object out of a string
				var net = new convnetjs.Net(); // create an empty network
				net.fromJSON(json); // load all parameters from JSON

				// forward a data point through the network
				var test = new convnetjs.Vol(lastTestResults);
				var prob = net.forward(test); 


				// get ranking scores from cnn
				var rankCNN = [];
				for(var i in prob.w){
					var treatmentIndex = parseInt(i)+1;
					rankCNN.push({treatment:'Treatment'+treatmentIndex.toString(),
						probability:prob.w[i]});
				}
				// rank results by probability
				rankCNN.sort(function(a,b){
					return (a.probability>b.probability)?-1:1;
				});


				// get up to 5 nearest neighbors of this patient
				var nearestPatients = [];
				$.ajax({
					url:'/similarPatients',
					data:{birthday:patientData.date_of_birth,gender:patientData.gender},
					type:'POST',
					async:false,
					success:function(data){
						nearestPatients = knnPatients(patientData,data,5);
					}
				});

				// calculate ranking scores for recommendation
				var treatmentScore = {};
				var length = rankCNN.length;
				for(var i in rankCNN){
					var rank = rankCNN[i];
					if(!treatmentScore.hasOwnProperty(rank)){
						treatmentScore[rank.treatment] = length-i;
					}
					treatmentScore[rank.treatment] += length-i;
				}

				// get ranking scores from treatment frequency
				var treatmentFrequency = {};
				var rankFreq = [];
				for(var i in nearestPatients){
					var patient = nearestPatients[i].patient;
					var treatments = patient.treatments;
					for(var j in treatments){
						var treatment = treatments[j];
						var drugs = treatment.treatment;
						for(var k in drugs){
							var drug = drugs[k];
							itemCounts(treatmentFrequency,drug,1);
						}
					}
				}
				for(var i in treatmentFrequency){
					rankFreq.push({treatment:i,
						frequency:treatmentFrequency[i]})
				};
				// rank results by frequency
				rankFreq.sort(function(a,b){
					return (a.frequency>b.frequency)?-1:1;
				});

				var length = rankFreq.length;
				for(var i in rankFreq){
					var rank = rankFreq[i];
					if(!treatmentScore.hasOwnProperty(rank)){
						treatmentScore[rank.treatment] = length-i;
					}
					treatmentScore[rank.treatment] += length-i;	
				}
				var plotData = Object.keys(treatmentScore).map(
					function(key,value){
						return {treatment:key,score:treatmentScore[key]}; 
					}
				);

				plotData.sort(function(a,b){return (a.score>b.score)?-1:1;});
				plotData.unshift({treatment:'Treatment',score:'Ranking Score'});

				tabulate(plotData,['treatment','score'],'','recommendation');
			}
		});
		
	};

	// get k nearest neighbors of a patient
	function knnPatients(patient,similarPatients,num){
		var similarity = {};

		// calculate frequency of different diagnoses, symptoms and treatments 
		// based on the patient
		// frequency = {diagnosis:{Diabetes:xx,...},symptom:{...},treatment:{...}}
		var calculateProps = ['diagnosis', 'symptom', 'treatment'];
		var frequency = {};
		for(var j in calculateProps){
			var prop = calculateProps[j];
			if(!frequency.hasOwnProperty(prop)){
				frequency[prop] = {};
			}
			if(prop=='diagnosis'){
				for(var k in patient.treatments){
					var treatment = patient.treatments[k];
					for(var l in treatment.diagnosis){
						var disease = treatment.diagnosis[l];
						if(!frequency.diagnosis.hasOwnProperty(disease)){
							frequency.diagnosis[disease] = [];
						}
						frequency.diagnosis[disease].push(getYear(treatment.date))
					}
				}
			}else{
				for(var k in patient.treatments){
					var treatment = patient.treatments[k];
					for(var l in treatment[prop]){
						itemCounts(frequency[prop],treatment[prop][l],1);
					}
				}
			}
		}

		console.log(frequency)

		for(var i in similarPatients){
			var similarPatient = similarPatients[i];
			if(!similarity.hasOwnProperty(similarPatient.id)){
				similarity[similarPatient.id] = [];
			};

			// calculate similarity
			// compare the similarity of race and job
			var calculateProps = ['race', 'job_title'];
			for(var j in calculateProps){
				var prop = calculateProps[j];
				var patientProp = patient[prop];
				var simPatientProp = similarPatient[prop];
				if(patientProp==simPatientProp){
					similarity[similarPatient.id].push(1);
				}else{
					similarity[similarPatient.id].push(0);
				}
			};
			

			var treatments = similarPatient.treatments;
			var frequencySim = {};
			for(var index in treatments){
				var treatment = treatments[index];

				// calculate frequency of different diagnoses, symptoms and treatments 
				// based on similar patients
				// frequency = {diagnosis:{Diabetes:xx,...},symptom:{...},treatment:{...}}
				var calculateProps = ['diagnosis', 'symptom', 'treatment'];
				for(var j in calculateProps){
					var prop = calculateProps[j];
					if(!frequencySim.hasOwnProperty(prop)){
						frequencySim[prop] = {};
					}
					if(prop=='diagnosis'){
						for(var k in treatment.diagnosis){
							var disease = treatment.diagnosis[k];
							if(!frequencySim.diagnosis.hasOwnProperty(disease)){
								frequencySim.diagnosis[disease] = [];
							}
							frequencySim.diagnosis[disease].push(getYear(treatment.date));
						}
					}else{
						for(var k in treatment[prop]){
							itemCounts(frequencySim[prop], treatment[prop][k],1);
						}
					}
				}
			}
			// calculate similarities between the patient and his/her similar patients
			// treatmentSim algorith is used to calculate similarities
			similarity[similarPatient.id].push(treatmentSim(frequency,frequencySim));
		};
		console.log(similarity);
		var patients = [];
		for(var id in similarity){
			patients.push({patient:$.grep(similarPatients, function(a){return a.id==id}),
				similarity:arrayAvg(similarity[id])})
		}
		// sort by similarities
		patients.sort(function(a,b){
			return a.similarity > b.similarity ? -1 : 1
		})

		// patients = [{patient:{},similarity:xx},{},{},...]
		return patients.slice(0,num)
	};

	// calculate similarities between treatment records
	function treatmentSim(freq,freqSim){
		var results = {};
		
		var diagnosis = freq.diagnosis;
		// calculate total number of diseases
		var sum = 0;
		for(var disease in diagnosis){
			sum += diagnosis[disease].length;
		}
		var sumSim = 0;
		for(var disease in freqSim.diagnosis){
			sumSim += freqSim.diagnosis[disease].length;
		}

		for(var disease in diagnosis){

			results[disease] = [];

			// step1: calculate disease interval
			var intervals = [];
			var interval = [];

			if(freq.diagnosis[disease].length>1){
				for(var i=0; i<(freq.diagnosis[disease].length-1); i++){
					var diff = freq.diagnosis[disease][i] - freq.diagnosis[disease][i+1];
					interval.push(diff);
				}
			}else{
				interval.push(0);
			}
			intervals.push(arrayAvg(interval));

			if(freqSim.diagnosis.hasOwnProperty(disease)){
				var interval = [];

				if(freqSim.diagnosis[disease].length>1){
					for(var i=0; i<(freqSim.diagnosis[disease].length-1); i++){
						var diff = freqSim.diagnosis[disease][i] - freqSim.diagnosis[disease][i+1];
						interval.push(diff);
					}
				}else{
					interval.push(0);
				}
				intervals.push(arrayAvg(interval));
			}else{
				intervals.push(0);
			}
			results[disease].intervals = intervals;

			// step2: store freuqency to results
			var frequencys = [];
			frequencys.push(freq.diagnosis[disease].length);
			if(freqSim.diagnosis.hasOwnProperty(disease)){
				frequencys.push(freqSim.diagnosis[disease].length);
			}else{
				frequencys.push(0);
			}
			results[disease].frequencys = frequencys;

			// step3: calculate disease proportion
			var proportions = [];
			proportions.push(1-freq.diagnosis[disease].length/sum);
			if(freqSim.diagnosis.hasOwnProperty(disease)){
				proportions.push(1-freqSim.diagnosis[disease].length/sumSim);
			}else{
				proportions.push(0);
			}
			results[disease].proportions = proportions;
		}

		//console.log(results)

		// step4: calculate similarity
		var similarity = {};
		for(var disease in results){

			// calculate similarity of intervals
			var interval = simCalculation(results[disease].intervals);
			//console.log(disease+' '+interval)
			// calculate similarity of frequencys
			var frequency = simCalculation(results[disease].frequencys);
			//console.log(disease+' '+frequency)
			// calculate similarity of proportions
			var proportion = simCalculation(results[disease].proportions);
			//console.log(disease+' '+proportion)
			similarity[disease] = arrayAvg([interval,frequency,proportion]);
		}
		console.log(similarity)
		var result = [];
		for(var disease in similarity){
			result.push(similarity[disease]);
		}
		return arrayAvg(result);
	}

	// calculate similarity of the input
	// input = [xx,xx]
	function simCalculation(array){
		if(array[0]==0){
			return 0
		}else{
			return parseInt((Math.abs(array[0]-array[1])/array[0]).toFixed(2));
		}
		
	}

	function arrayAvg(array){
		var sum = 0;
		for(var i in array){
			sum += array[i];
		}
		return sum/(array.length)
	}

	function getYear(num){
		return parseInt(num.toString().slice(0,4));
	}

	// used pie chart to plot occupations of treatments
	function plotTreatment(data){

		disease = data[0];
		diseaseName = disease.name;

		$('#diseaseTreatment').html('<h3>'+diseaseName+' Treatments</h3>')
		
		diseaseFreq = disease.frequency[diseaseName];
		var diff = Infinity;
		$.ajax({
			url:'/findDisease',
			type:'POST',
			data:{ diseaseName:diseaseName },
			async:false,
			success:function(data){
				//console.log(data);
				plotPieChart(data,'info2','treatmentProportion',
					'Treatment Proportion of '+diseaseName,0.5)
			}
		});
	}

	// plot pie charts
	function plotPieChart(data,position,divID,title,heightProportion){
		// prepare a DOM to plot pie chart
		var box = document.getElementById(position).getBoundingClientRect(),
		width = box.width,
		height = box.height*heightProportion;
		chartDiv = document.createElement('div');
		$(chartDiv)
			.attr('id',divID)
			.css('width',width).css('height',height)
			.appendTo($('#'+position));

		chart = echarts.init(document.getElementById(divID));

		// constructure plot data
		var plotData = [];
		treatmentFrequency = data[0].treatmentFrequency;
		length = Object.keys(treatmentFrequency).map(
			function(key){return treatmentFrequency.hasOwnProperty(key);}
		).length;

		if(length>=10){
			freq = topItems(treatmentFrequency,(length/2).toFixed(0));
		}else{
			freq = topItems(treatmentFrequency,length);
		}
		//console.log(freq)
		var partSum = 0;
		for(var treatment in freq){
			plotData.push({name:treatment,value:freq[treatment]});
			partSum += freq[treatment];
		}

		var sum = 0;
		for(var treatment in treatmentFrequency){
			sum += treatmentFrequency[treatment];
		}
		plotData.push({name:'Others',value:sum-partSum});

		//console.log(plotData)
		// plot
		option = {
			title : {
				text: 'Treatment Proportion',
				subtext: '',
				x:'center'
			},
			tooltip : {
				trigger: 'item',
				formatter: "{a} <br/>{b} : {c} ({d}%)"
			},
			series : [
				{
					name: 'Treatment Proportion',
					type: 'pie',
					radius: '55%',
					roseType: 'angle',
					data:plotData
				}
			]
		};
		chart.setOption(option);
	}

	// plot word cloud of word frequency of diseases
	function plotWordCloud(data){
		var disease = data[0];
		var diseaseName = disease.name;
		var wordFreq = disease.wordFrequency;
		var wordFreqPlot = topItems(wordFreq,30);
		var plotData = [];
		for(var word in wordFreqPlot){
			plotData.push(
				{text:word,size:wordFreq[word]}
			);
		}

		// prepare a DOM to plot prediction
		var box = document.getElementById('info').getBoundingClientRect(),
		width = box.width,
		height = box.height*0.5;
		chartDiv = document.createElement('div');
		$(chartDiv)
			.attr('id','wordCloud')
			.css('width',width).css('height',height)
			.appendTo($('#info'));

		$('#wordCloud').html('<h3 align="center">Word Cloud of '+diseaseName+'</h3>');

		//console.log(plotData);

		// plot word cloud
		//console.log(d3)
		//console.log(plotData)
		var color = d3.scaleOrdinal(d3.schemeCategory20);
		var linearScale = d3.scaleLinear().range([20,60]);
		linearScale.domain([
			d3.min(plotData,function(d){return d.size}),
			d3.max(plotData,function(d){return d.size})
		]);
		var layout = d3.layout.cloud()
		.size([width, height])
		.words(plotData)
		.padding(0)
		.rotate(function() { return ~~(Math.random() * 2) * 90; })
		.font("Impact")
		.fontSize(function(d) { return linearScale(d.size); })
		.on("end", draw);

		layout.start();

		function draw(words) {
			d3.select("#wordCloud").append("svg")
				.attr("width", width)
				.attr("height", height)
				.append("g")
				.attr("transform", "translate(" + width/2 + "," + height/2 + ")")
				.selectAll("text")
				.data(words)
				.enter().append("text")
				.style("font-size", function(d) { return d.size + "px"; })
				.style("font-family", "Impact")
				.style("fill", function(d, i) { return color(i); })
				.attr("text-anchor", "middle")
				.attr("transform", function(d) {
					return "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")";
				})
				.text(function(d) { return d.text; });
		}


	}

	// get top XX items in an object
	// expected object = {a:1,b:2,c:3...}
	function topItems(obj,num){
		var valueList = [];
		for(var item in obj){
			valueList.push(obj[item]);
		}
		// descending order
		valueList.sort(function(a,b){
			return b-a;
		});
		var threshold = valueList[num-1];
		var result = {};
		for(var item in obj){
			if(obj[item]>threshold){
				result[item] = obj[item];
			}
		}
		return result
	}

	// plot basic information of diseases
	function plotDiseaseInfo(data){
		disease = data[0];
		diseaseName = disease.name;

		// prepare a div
		var box = document.getElementById('info').getBoundingClientRect(),
		width = box.width,
		height = box.height*0.4;
		chartDiv = document.createElement('div');
		$(chartDiv)
			.attr('id','diseaseInfo')
			.css('width',width).css('height',height)
			.appendTo($('#info'));

		$('#diseaseInfo').css('overflow','auto');

		// tabulate(data,columns,caption,position)
		var plotData = [];
		// recovery rate
		plotData.push({property:'Rate of Recovery',
			value:(disease['recovery']/disease.frequency[diseaseName]).toFixed(2)});
		// reappear rate
		plotData.push({property:'Rate of Recurrence',
			value:(disease['recurrence']/disease.frequency[diseaseName]).toFixed(2)});
		// average duration
		plotData.push({property:'Average Duration',
			value:(disease['duration']['sum']/disease['duration']['length']).toFixed(2)});
		// most commonly occurs in age
		var sortable = [];
		var ageFreq = disease.ageFreq;

		for(var ageRange in ageFreq){
			sortable.push([ageRange,ageFreq[ageRange]])
		}
		sortable.sort(function(a,b){return b[1]-a[1];});
		plotData.push({property:'Most Commonly Occurs in (age):',
			value:(sortable[0][0])});
		// most commonly occurs in gender
		var sortable = [];
		var genderFreq = disease.genderFreq;
		for(var gender in genderFreq){
			sortable.push([gender,genderFreq[gender]])
		}
		sortable.sort(function(a,b){return b[1]-a[1];});
		plotData.push({property:'Most Commonly Occurs in (gender):',
			value:(sortable[0][0])});
		// most commonly occurs in address
		var sortable = [];
		var addressFreq = disease.addressFreq;
		for(var address in addressFreq){
			sortable.push([address,addressFreq[address]])
		}
		sortable.sort(function(a,b){return b[1]-a[1];});
		plotData.push({property:'Most Commonly Occurs in (city):',
			value:(sortable[0][0])});
		// most commonly occurs in job
		var sortable = [];
		var jobFreq = disease.jobFreq;
		for(var job in jobFreq){
			sortable.push([job,jobFreq[job]])
		}
		sortable.sort(function(a,b){return b[1]-a[1];});
		plotData.push({property:'Most Commonly Occurs in (job):',
			value:(sortable[0][0])});

		// average occurrences
		$.ajax({
			url:'/totalNumberOfPatients',
			type:'GET',
			async:false,
			success:function(data){
				plotData.push({property:'Average Occurrences of A Patient',
				value:(disease.frequency[diseaseName]/data[0]['totalPatients']).toFixed(2)})
				tabulate(plotData,['property','value'],diseaseName+'\'s Info','diseaseInfo');
			}
		})
		
	}

	// use d3js to plot relational graph of input graph
	function plotNetworkGraphV2(graph){
		//console.log(graph);
		// init svg
		var svg = d3.select("svg"),
			box = document.getElementById("svg").getBoundingClientRect(),
			width = box.width,
			height = box.height;
		var color = d3.scaleOrdinal(d3.schemeCategory20);
		
		var sizeScale = d3.scaleLinear().range([20,30]);
		sizeScale.domain([
			d3.min(graph.nodes,function(d){return d.size}),
			d3.max(graph.nodes,function(d){return d.size})
		]);

		var simulation = d3.forceSimulation()
			.force("link", d3.forceLink().id(
				function(d) { 
					return d.id; 
				}).distance(
						function(d){
							var distanceScale = d3.scaleLinear().range([70,350]);
							if(d.type=='pd'){
								distanceScale.domain([
									d3.min(graph.links,function(d){
										if(d.type=='pd'){
											return d.distance;
										}
									}),
									d3.max(graph.links,function(d){
										if(d.type=='pd'){
											return d.distance;
										}
									})
								]);
								return distanceScale(d.distance);
							}else if(d.type=='ds'){
								distanceScale.domain([
									d3.min(graph.links,function(d){
										if(d.type=='ds'){
											return d.distance;
										}
									}),
									d3.max(graph.links,function(d){
										if(d.type=='ds'){
											return d.distance;
										}
									})
								]);
								return distanceScale(d.distance);
							}else if(d.type=='dd'){
								distanceScale.domain([
									d3.min(graph.links,function(d){
										if(d.type=='dd'){
											return d.distance;
										}
									}),
									d3.max(graph.links,function(d){
										if(d.type=='dd'){
											return d.distance;
										}
									})
								]);
								return distanceScale(d.distance);
							}
						}
					)
				)
			.force("charge", d3.forceManyBody())
			.force("center", d3.forceCenter(width / 2, height / 2));

		// plot relational graph
		svg.html('');	// clear svg

		// add links
		var link = svg.append("g")
			.selectAll("line")
			.data(graph.links)
			.enter().append("line")
			.attr("class",
				function(d) { 
					if(d.type=='ds'){
						return 'links_dashed';
					}else{
						return 'links';
					}
				})
			.attr("stroke-width", 5)
			.attr("stroke", 
				function(d) { 
					if(d.type=='dd'){
						return '#BBB';
					}else if(d.type=='pd'){
						return '#666'
					}else if(d.type=='ds'){
						return '#DDD'
					}
				
				});	
		link.append('title')		
			.text(function(d){ 
				if(d.type=='dd'){
					return 'P('+d.target+'|'+d.source+')='+d.value.toFixed(2)*100+'%';
				}else{
					return 'Frequency: \n'+d.value;
				}
			});
		// add nodes
		var node = svg.append("g")
			.attr("class", "nodes")
			.selectAll("circle")
			.data(graph.nodes)
			.enter().append('circle')
			.attr("r", function(d){return sizeScale(d.size)})
			.attr("fill", function(d){return color(d.group);})
			.call(
				d3.drag()
					.on("start", dragstarted)
					.on("drag", dragged)
					.on("end", dragended)
			);


		node.on('mouseover',mouseOver)
			.on('mouseout',mouseOut)
			.on('click',mouseClick)
			.on('dblclick',doubleClick);

		node.append("title")
			.text(function(d) { 
				if(d.group=='patient'){
					return 'Patient: \n'+d.name;
				}else if(d.group=='disease'){
					return 'Disease: '+d.id+'\nFrequency: '+d.size;
				}else{
					return 'Medicine: '+d.id+'\nFrequency: '+d.size;
				}; 
			});

		// add labels
		var nodeLabel = svg.append("g")
				.attr("class", "labels")
				.selectAll("text")
				.data(graph.nodes)
				.enter().append("text")
				.attr("x",12)
				.attr("y",".3em")
				.attr("text-anchor","middle")
				.style("font-size",10)
				.text(function(d) { return d.name });
/*
		var linkLabel = svg.append("g")
				.attr("class", "labels")
				.selectAll("text")
				.data(graph.links)
				.enter().append("text")
				.attr("x", 8)
				.attr("y", ".1em")
				.attr("font-size","10")
				//.attr("text-anchor","middle")
				.text(function(d) { 
					if(d.type=='dd'){
						return 'P('+d.source.substr(0,4)+'|'+
						d.target.substr(0,4)+')='+d.value.toFixed(2)*100+'%' ;
					}else{
						return ''
					}
				});
*/
		// add legend
		var legend = svg.selectAll(".legend")
			.data(color.domain())
			.enter().append("g")
			.attr("class", "legend")
			.attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

		legend.append("rect")
			.attr("x", width - 18)
			.attr("width", 18)
			.attr("height", 18)
			.style("fill", color);

		legend.append("text")
			.attr("x", width - 24)
			.attr("y", 9)
			.attr("dy", ".35em")
			.style("text-anchor", "end")
			.text(function(d) { return d; });

		// start simulation
		simulation.nodes(graph.nodes)
			.on("tick", ticked);
		simulation.force("link")
			.links(graph['links']);


		function mouseOver(d,i) {
			window.currentRadius = d3.select(this).attr('r');
			d3.select(this).attr('r',currentRadius*1.3);
		}

		function mouseOut(d,i) {
			d3.select(this).attr('r',window.currentRadius);
		}

		function doubleClick(d){
			//console.log(d);
			if(d.group=='disease'){
				var graph = graphOnDisease(d);
				console.log(graph);
				plotNetworkGraphV2(graph);
			}else if(d.group=='patient'){
				var graph = graphOnPatient(d);
				plotNetworkGraphV2(graph);
			}else if(d.group=='symptom'){
				var graph = graphOnSymptom(d);
				plotNetworkGraphV2(graph);
			}
		}

		function mouseClick(d){
			const fromTime = $('#from-time').val();
			const toTime = $('#to-time').val();
			if(d.group=='patient'){
				patientID = d.id;
				console.log(patientID)
				$.post('/findPatient',{patientID:patientID},
					function(data,status){
						console.log(data);
						plotData = periodOfPatient(fromTime,toTime,data);
						plotNetworkGraphV2(graphOnPatient(plotData));
						$('#info').html('');
						//$('#info').css('width','40%');
						$('#info2').html('');
						//$('#info2').css('width','20%');
						plotPatientInfo(plotData);
						plotComparison(data);
						plotHealthChart(plotData);
						
				});
			}else if(d.group=='disease'){
				$.post('/findDisease',{diseaseName:d.name},
					function(data,status){
						//console.log(data);
						$('#info').html('');
						//$('#info').css('width','30%');
						plotDiseaseInfo(data);
						plotWordCloud(data);

						$('#info2').html('');
						//$('#info2').css('width','30%');
						plotTreatment(data);
						plotRecommendation(data);
					})
			}
		}

		function ticked() {
			link
				.attr("x1", function(d) { return d.source.x; })
				.attr("y1", function(d) { return d.source.y; })
				.attr("x2", function(d) { return d.target.x; })
				.attr("y2", function(d) { return d.target.y; });
			node
				.attr("cx", function(d) { return d.x; })
				.attr("cy", function(d) { return d.y; });
			nodeLabel
				.attr("x", function(d) { return d.x; })
				.attr("y", function(d) { return d.y; });
/*
			linkLabel
				.attr("x", function(d) { return d.source.x+(d.target.x-d.source.x)/3; })
				.attr("y", function(d) { return d.source.y+(d.target.y-d.source.y)/3; });
*/		}

		function dragstarted(d) {
			if (!d3.event.active) simulation.alphaTarget(0.3).restart();
			d.fx = d.x;
			d.fy = d.y;
		}

		function dragged(d) {
			d.fx = d3.event.x;
			d.fy = d3.event.y;
		}

		function dragended(d) {
			if (!d3.event.active) simulation.alphaTarget(0);
			d.fx = null;
			d.fy = null;
		}

	}



}) // closure of ready()