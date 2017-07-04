import datetime
import json
from openpyxl import load_workbook
from pprint import pprint
import random

def treatmentChoice(num,prob,range):
    rand = random.random()
    min = range[0]
    max = range[1]
    if rand < prob:
        return 'Treatment'+str(num)
    else:
        return 'Treatment'+str(random.randint(min,max))

def symptomChoice(num,prob,range):
    rand = random.random()
    min = range[0]
    max = range[1]
    if rand < prob:
        return 'Symptom'+str(num)
    else:
        return 'Symptom'+str(random.randint(min,max))


def diagnosis(diagList,treatList,symtomList,flags):
    #weight
    if flags['BMI'] >= 30:
        diagList.append('Obesity')
        treatList.append(treatmentChoice(1,0.8,[1,5]))
        symtomList.append(symptomChoice(1,0.9,[1,5]))
    elif flags['BMI'] >= 25:
        diagList.append('Overweight')
        treatList.append(treatmentChoice(3,0.8,[3,8]))
        symtomList.append(symptomChoice(3,0.9,[3,8]))
    #hypertension
    if flags['SBP'] >= 140:
        if flags['DBP'] >= 90:
            diagList.append('Hypertension')
            treatList.append(treatmentChoice(5,0.8,[7,11]))
            symtomList.append(symptomChoice(5,0.8,[7,11]))
        else:
            diagList.append('RiskOfHypertension')
            treatList.append(treatmentChoice(7,0.8,[8,11]))
            symtomList.append(symptomChoice(7,0.8,[8,11]))
    elif flags['SBP'] >= 140 or flags['DBP'] >= 90:
        diagList.append('RiskOfHypertension')
        treatList.append(treatmentChoice(9,0.9,[8,11]))
        symtomList.append(symptomChoice(9,0.9,[8,11]))
    #diabetes
    if flags['FBS'] >= 126 or flags['HBA1C'] >= 6.5:
        diagList.append('Diabetes')
        treatList.append(treatmentChoice(11,0.9,[7,15]))
        symtomList.append(symptomChoice(11,0.9,[7,15]))
    elif flags['FBS'] >= 100 or flags['HBA1C'] >= 5.7:
        diagList.append('RiskOfDiabetes')
        treatList.append(treatmentChoice(13,0.9,[9,12]))
        symtomList.append(symptomChoice(13,0.95,[9,12]))
    #hyperlipidemia
    if flags['Cholesterol'] >= 240:
        diagList.append('Hyperlipidemia')
        treatList.append(treatmentChoice(15,0.9,[15,20]))
        symtomList.append(symptomChoice(15,0.9,[15,20]))
    elif flags['Cholesterol'] >= 200:
        diagList.append('RiskOfHyperlipidemia')
        treatList.append(treatmentChoice(17,0.8,[17,19]))
        symtomList.append(symptomChoice(17,0.8,[17,19]))

def converToID(id):
    length = len(str(id))
    if length < 5:
        id = 'P'+'0'*(5-length)+str(id)
    else:
        id = 'P'+str(id)
    return id


fileURL = '/home/lixing/Dropbox/thesis/documents/'
with open(fileURL+'Patient Info.json','r') as jsonFile:
    personalInfo = json.load(jsonFile)
    jsonFile.close()

with open(fileURL+'diabetesData.xlsx','rb') as xlsxFile:
    wb = load_workbook(xlsxFile)
    testResults = wb.get_sheet_by_name('TestParameters')
    xlsxFile.close()

rowNum = 0
tests = []
patients = []
count = 0
diagnosisDesc = []
procedureDesc = []

for row in testResults.rows:
    # only get tests results
    if rowNum == 0:
        for i in range(3,12):
            tests.append(row[i].value)
        print(tests)
        rowNum += 1
    else:
        patient = {}
        person = personalInfo[rowNum]
        for info in person:
            if info == 'id':
                patient['id'] = converToID(rowNum)
            elif info == 'treatment':
                diagnosisDesc.append(person['treatment']['diagnosis'])
                procedureDesc.append(person['treatment']['procedure'])
            else:
                patient[info] = person[info]
        patient['group'] = 'patient'
        patient['treatments'] = []

        # calculate test times that each patient has
        dob = patient['date_of_birth']
        birthYear = int(dob[-4:])
        if birthYear < 1980:
            treatmentNum = 2017-1980
        else:
            treatmentNum = 2017-birthYear-20
            if treatmentNum <= 0:
                treatmentNum = 0

        # simulate treatment data
        startYear = 2017
        month = random.randint(1, 12)
        day = random.randint(1, 28)
        realTestData = {}
        for i in range(treatmentNum):
            date = startYear * 10000 + month * 100 + day
            startYear -= 1

            treatment = {}
            treatment['date'] = date
            treatment['test'] = []

            flags = {}
            if len(realTestData) == 0:
                for j in range(len(tests)):
                    testType = tests[j]
                    testResult = row[j + 3].value
                    realTestData[testType] = testResult

            for j in range(len(tests)):
                test = {}
                testType = tests[j]
                testResult = realTestData[testType]*random.uniform(0.8,1.2)
                if testType == 'BMI' or testType == 'HBA1C':
                    testResult = round(testResult,1)
                else:
                    testResult = round(testResult)
                test['type'] = testType
                test['result'] = testResult
                flags[testType] = testResult
                treatment['test'].append(test)

            # get diagnosis
            treatment['diagnosis'] = []
            treatment['treatment'] = []
            treatment['symptom'] = []
            diagnosis(treatment['diagnosis'],treatment['treatment'],treatment['symptom'],flags)

            treatment['diagnosis_description'] = random.choice(diagnosisDesc)
            treatment['procedure_description'] = random.choice(procedureDesc)


            patient['treatments'].append(treatment)
        patients.append(patient)
        rowNum += 1

    print('handling '+str(count))
    count += 1
    if count == -1:
        break

for i in range(3):
    pprint(patients[i])
#pprint(patients)

with open(fileURL+'data1000','w') as dataFile:
    print('dumping json file...')
    json.dump(patients,dataFile)
    print('done!')
    dataFile.close()