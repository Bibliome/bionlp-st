//THEME = 'classic';
//THEME = 'energyblue';
THEME = 'fresh';
//THEME = 'ui-sunny';

var global = {
		'taskName': null,
		'tasks': [],
		'set': 'train',
		'action': 'evaluate',
		'detailed': false,
		'alternate': true,
		'auth2': null,
		'data': null,
		'last-result': null,
		'notify': {
			'congratulate': true,
			'ask-login': true
		}
};

var _getTestStatus = function(task) {
	if (task['test-check']) {
		if (task['test-evaluate']) {
			return 'available';
		}
		return 'only for check';
	}
	return 'unavailable';
}

var _notification = function(msg) {
	$('#notification-contents').html(msg);
	$('#wid-notification').jqxNotification('open');
}

var initNotificationWidget = function() {
	$('#wid-notification').jqxNotification({
		theme: THEME,
		template: 'error',
		showCloseButton: false,
		position: 'top-left',
		autoCloseDelay: 10000
	});
}

var _selectTask = function(task) {
	if (task == null) {
		return;
	}
	var bg = $('#wid-set');
	var i = bg.jqxButtonGroup('getSelection');
	if (task['test-check']) {
		var sb = $('#wid-action');
		if (task['test-evaluate']) {
			sb.jqxSwitchButton('enable');
		}
		else {
			if (i == 3) {
				if (global.action == 'evaluate') {
					_notification('Evaluation is not available for the test set of task ' + global.taskName + '. Only Check is allowed.');
				}
				sb.jqxSwitchButton('uncheck');
				global.action = 'check';
			}
			sb.jqxSwitchButton('disable');
		}
		bg.jqxButtonGroup('enableAt', 3);
	}
	else {
		if (i == 3) {
			_notification('Test set of task ' + global.taskName + ' is not available. Set is now Train.');
			global.set = 'train';
			bg.jqxButtonGroup('setSelection', 0);
			$('#wid-detailed').jqxCheckBox('enable');
		}
		bg.jqxButtonGroup('disableAt', 3);
	}
	global.taskName = task.name;
	updateSubmissions();
}

var _getTask = function(index) {
    var item;
    if (index === undefined) {
    	item = $('#wid-task').jqxDropDownList('getSelectedItem');
    }
    else {
    	item = $('#wid-task').jqxDropDownList('getItem', index);
    }
    if (item != null) {
    	return item.originalItem;
    }
    return null;
}

var initTasksWidget = function() {
    $.ajax({
    	url: 'api/list-tasks',
    	success: function(data, status, xhr) {
    		for (var i = 0; i < data.length; ++i) {
    			var task = data[i];
    			task.test_status = _getTestStatus(task);
    		}
    		var source = new $.jqx.dataAdapter({ localdata: data, datatype: 'array' });
    		var e = $('#wid-task');
    		e.jqxDropDownList({
    			theme: THEME,
    			source: source,
    			displayMember: 'name',
    			valueMember: 'name',
    			selectedIndex: 0,
    			width: 348,
    			autoDropDownHeight: true,
    			enableBrowserBoundsDetection: true,
    			dropDownWidth: 560,
    			renderer: function(index, label, value) {
    				var t = data[index];
    				return '<div class="task-item"><div class="task-name">' + t.name + '</div><div class="task-description">' + t.description + '</div><div class="task-test">Test set ' + t.test_status + '</div></div>';
    			},
    			selectionRenderer: function(html) {
    				return '<div class="task-name task-name-selection">'+html[0].textContent+'</div>';
    			}
    		});
    		_selectTask(data[0]);
    		e.on('select', function(event) {
    			var task = _getTask(event.args.index);
    			_selectTask(task);
    		})
    	}
    });
}

var initSetsWidget = function() {
	var e = $("#wid-set");
	e.jqxButtonGroup({
		theme: THEME,
    	mode: 'radio'
    });
    e.jqxButtonGroup('setSelection', 0);
    e.on('buttonclick', function(event) {
	   	global.set = event.args.button[0].textContent.toLowerCase();
   		var sb = $('#wid-action');
   		var cb = $('#wid-detailed');
	   	if (global.set == 'test') {
	   		var task = _getTask();
	   		if (task['test-evaluate']) {
	   			sb.jqxSwitchButton('enable');
	   		}
	   		else {
	   			if (global.action == 'evaluate') {
					_notification('Evaluation is not available for the test set of task ' + global.taskName + '. Only Check is allowed.');
	   				sb.jqxSwitchButton('uncheck');
	   				global.action = 'check';
	   			}
	   			sb.jqxSwitchButton('disable');
	   		}
	   		if (global.detailed) {
	   			_notification('Detailed evaluation is not available for test set.');
	   		}
	   		global.detailed = false;
	   		cb.jqxCheckBox('uncheck');
	   		cb.jqxCheckBox('disable');
	   	}
	   	else {
   			sb.jqxSwitchButton('enable');
	   		cb.jqxCheckBox('enable');
	   	}
    });
}

var initActionWidget = function() {
	var e = $('#wid-action');
	e.jqxSwitchButton({
		theme: THEME,
    	checked: (global.action == 'evaluate'),
    	onLabel: '<span class="action">Evaluate</span>',
    	offLabel: '<span class="action">Check</span>',
    	width: 200
    });
	e.on('checked', function(event) {
		global.action = 'check';
	});
	e.on('unchecked', function(event) {
		global.action = 'evaluate';
	});
}

var initDetailedWidget = function() {
	var e = $('#wid-detailed');
	e.jqxCheckBox({
		theme: THEME,
		width: 350,
    	checked: global.detailed
    });
	e.on('checked', function(event) {
		global.detailed = true;
	});
	e.on('unchecked', function(event) {
		global.detailed = false;
	});
}

var getAuthToken = function() {
	if (global.auth2) {
		return global.auth2.currentUser.get().getAuthResponse().id_token;
	}
}

var getURLWithToken = function(url) {
	var token = getAuthToken();
	if (token) {
		var param = 'token=' + token;
		if (url.endsWith('?')) {
			return url + param;
		}
		if ((url.includes && url.includes('?')) || (url.contains && url.contains('?'))) { // fix for FF 18-39: https://bugzilla.mozilla.org/show_bug.cgi?id=1102219
			return url + '&' + param;
		}
		return url + '?' + param;
	}
	return url;
}

var prepareUpload = function() {
	$('.hidden-upload').remove();
	var e = $('form');
	e.append('<input class="hidden-upload" type="hidden" name="action" value="'+global.action+'">');	
    e.append('<input class="hidden-upload" type="hidden" name="detailed" value="'+global.detailed+'">');
    e.append('<input class="hidden-upload" type="hidden" name="alternate" value="'+global.alternate+'">');
    e.append('<input class="hidden-upload" type="hidden" name="taskName" value="'+global.taskName+'">');
    e.append('<input class="hidden-upload" type="hidden" name="set" value="'+global.set+'">');
    if (getAuthToken()) {
    	e.append('<input class="hidden-upload" type="hidden" name="token" value="'+getAuthToken()+'">');
    }
	$('#sec-messages').empty();
	$('#sec-evaluation').empty();
	$('#sec-pairs').empty();
	$('#sec-output').jqxTabs('select', 0);
	$('#wid-loader').jqxLoader('open');
}

var displayMessages = function(response) {
	if (response.success) {
		return;
	}
	var cont = $('#sec-messages');
	for (var i = 0; i < response.messages.length; ++i) {
		var msg = response.messages[i];
		var loc = msg.source;
		if (msg.lineno >= 0) {
			loc = loc + ':' + msg.lineno;
		}
		cont.append('<div class="message '+msg.level+'"><div class="message-location">'+loc+'</div><div class="message-body">' + msg.body+'</div></div>');
	}
}

var getNextId = function(idFactory) {
	var result = idFactory.next;
	idFactory.next++;
	return result;
}

var evalObjs = function(evals, idFactory, doc) {
	for (var i = 0; i < evals.length; ++i) {
		evalObj(evals[i], idFactory, doc, (i == 0));
	}
	return evals;
}

var evalObj = function(eval, idFactory, doc, expanded) {
	eval.id = getNextId(idFactory);
	if (eval.pairs) {
		eval.value = {
				document: doc,
				eval: eval.name
		};
	}
	else {
		eval.value = null;
	}
	eval.expanded = expanded;
	eval.children = scoringObjs(eval.scorings, idFactory);
}

var scoringObjs = function(scores, idFactory) {
	for (var i = 0; i < scores.length; ++i) {
		scoringObj(scores[i], idFactory, (i == 0));
	}
	return scores;
}

var scoringObj = function(score, idFactory, expanded) {
	score.id = getNextId(idFactory);
	score.value = null;
	score.expanded = expanded;
	score.children = measureObjs(score.measures, idFactory);
}

var measureObjs = function(measures, idFactory) {
	for (var i = 0; i < measures.length; ++i) {
		measureObj(measures[i], idFactory);
	}
	return measures;
}

var measureObj = function(measure, idFactory) {
	var value;
	measure.id = getNextId(idFactory);
	if (measure.value == null) {
		measure.value = 'NA';
	}
	else {
		measure.value = measure.value.toPrecision(4);
	}
	measure.children = [];
	return measure;
}

var evaluationDataObjs = function(response) {
	var idFactory = { next: 0 };
	var data = [];
	data.push({
		id: getNextId(idFactory),
		name: 'All documents',
		value: null,
		expanded: true,
		children: evalObjs(response.evaluation['global-evaluations'], idFactory, 'Corpus')
	});
	if (response.evaluation.detail) {
		for (var i = 0; i < response.evaluation.detail.length; ++i) {
			var doc = response.evaluation.detail[i].document;
			data.push({
				id: getNextId(idFactory),
				name: doc,
				value: null,
				expanded: false,
				children: evalObjs(response.evaluation.detail[i].evaluations, idFactory, doc)
			});
		}
	}
	return data;
}

var _lookupEval = function(doc, evalName) {
	for (var i = 1; i < global.data.length; ++i) {
		var item = global.data[i];
		if (item.name == doc) {
			for (var e = 0; e < item.children.length; ++e) {
				var eval = item.children[e];
				if (eval.name == evalName) {
					return eval;
				}
			}
			return null;
		}
	}
	return null;
}

var flattenPairAnnotation = function(pair, a, prefix) {
	if (a === undefined) {
		flattenPairMissingAnnotation(pair, prefix);
		return;
	}
	pair[prefix+'-source'] = a.source;
	pair[prefix+'-lineno'] = a.lineno;
	pair[prefix+'-location'] = a.source + ':' + a.lineno;
	pair[prefix+'-id'] = a.id;
	pair[prefix+'-type'] = a.type;
	pair[prefix+'-str'] = a.str;
}

var flattenPairMissingAnnotation = function(pair, prefix) {
	pair[prefix+'-source'] = null;
	pair[prefix+'-lineno'] = null;
	pair[prefix+'-location'] = null;
	pair[prefix+'-id'] = null;
	pair[prefix+'-type'] = null;
	pair[prefix+'-str'] = null;
}

var getMatchType = function(pair) {
	if (pair.reference === undefined) {
		return 'False Positive';
	}
	if (pair.prediction === undefined) {
		return 'False Negative';
	}
	if (pair.similarity == 1) {
		return 'Match';
	}
	return 'Partial';
}

var flattenPair = function(id, pair) {
	pair.id = id;
	pair.type = getMatchType(pair);
	flattenPairAnnotation(pair, pair.reference, 'reference');
	flattenPairAnnotation(pair, pair.prediction, 'prediction');
}

var flattenPairs = function(pairs) {
	for (var i = 0; i < pairs.length; ++i) {
		flattenPair(i, pairs[i]);
	}
}

var handleShowPairsButton = function(event) {
	var info = event.target.id.replace(/_plus_/g, '+').replace(/_space_/g, ' ').split('__'); // see kludgeIdName
	var doc = info[1];
	var evalName = info[2];
	var eval = _lookupEval(doc, evalName);
	var cont = $('#sec-pairs');
	cont.empty();
	cont.append('<div class="help">Pairings of '+doc+' / '+evalName+'</div>');
	cont.append('<div id="wid-pairs"></div>');
	flattenPairs(eval.pairs);
	var dataAdapter = new $.jqx.dataAdapter({
		dataType: 'json',
		dataFields: [
		             { name: 'reference-source'   , type: 'string' },
		             { name: 'reference-lineno'   , type: 'number' },
		             { name: 'reference-location' , type: 'string' },
		             { name: 'reference-id'       , type: 'string' },
		             { name: 'reference-type'     , type: 'string' },
		             { name: 'reference-str'      , type: 'string' },
		             { name: 'prediction-source'  , type: 'string' },
		             { name: 'prediction-lineno'  , type: 'number' },
		             { name: 'prediction-location', type: 'string' },
		             { name: 'prediction-id'      , type: 'string' },
		             { name: 'prediction-type'    , type: 'string' },
		             { name: 'prediction-str'     , type: 'string' },
		             { name: 'type'               , type: 'number' },
		             { name: 'similarity'         , type: 'number' },
		             { name: 'explain-similarity' , type: 'string' },
		             { name: 'id'                 , type: 'number' }
		             ],
		id: 'id',
		localData: eval.pairs
	});
	$('#wid-pairs').jqxGrid({
		theme: THEME,
		source: dataAdapter,
        columnsresize: true,
        sortable: true,
        autoheight: true,
        width: 510,
        enabletooltips: true,
        rowdetails: true,
        rowdetailstemplate: { rowdetails: '<div class="sec-pair-detail"></div>' },
        initrowdetails: function (index, parentElement, gridElement, datarecord) {
            var div = $($(parentElement).children()[0]);
            if (datarecord['reference-id'] != null) {
            	div.append('<div class="sec-pair-detail-annotation"><span class="detail-title">Reference:</span> <span class="detail-str">' + datarecord['reference-str']+'</span></div>');
            	div.append('<div class="sec-pair-detail-location"><span class="detail-title">Location:</span> <span class="detail-location">' + datarecord['reference-location'] + '</span></div>');
            }
            if (datarecord['prediction-id'] != null) {
            	div.append('<div class="sec-pair-detail-annotation"><span class="detail-title">Prediction:</span> <span class="detail-str">' + datarecord['prediction-str']+'</span></div>');
            	div.append('<div class="sec-pair-detail-location"><span class="detail-title">Location:</span> <span class="detail-location">' + datarecord['prediction-location'] + '</span></div>');
            }
            if (datarecord['explain-similarity'] !== undefined) {
            	div.append('<div class="sec-pair-detail-similarity"><span class="detail-title">Similarity:</span> <span class="detail-similarity">' + datarecord['explain-similarity']+'</span></div>');
            }
        },
		columns: [
		             { datafield: 'reference-source'   , width: 100, text: 'Source', columngroup: 'Reference', hidden: true },
		             { datafield: 'reference-lineno'   , width:  20, text: 'Line', columngroup: 'Reference', hidden: true },
		             { datafield: 'reference-location' , width: 100, text: 'Location', columngroup: 'Reference', hidden: true },
		             { datafield: 'reference-id'       , width:  30, text: 'ID', columngroup: 'Reference' },
		             { datafield: 'reference-type'     , width: 150, text: 'Type', columngroup: 'Reference' },
		             { datafield: 'reference-str'      , width: 100, text: '', columngroup: 'Reference', hidden: true },
		             { datafield: 'prediction-source'  , width: 100, text: 'Source', columngroup: 'Prediction', hidden: true },
		             { datafield: 'prediction-lineno'  , width:  20, text: 'Line', columngroup: 'Prediction', hidden: true },
		             { datafield: 'prediction-location', width: 100, text: 'Location', columngroup: 'Prediction', hidden: true },
		             { datafield: 'prediction-id'      , width:  30, text: 'ID', columngroup: 'Prediction' },
		             { datafield: 'prediction-type'    , width: 150, text: 'Type', columngroup: 'Prediction' },
		             { datafield: 'prediction-str'     , width: 100, text: '', columngroup: 'Prediction', hidden: true },
		             { datafield: 'type'               , width:  75, text: 'Match' },
		             { datafield: 'similarity'         , width:  75, text: 'Similarity', cellsalign: 'center' },
		             { datafield: 'explain-similarity' , width: 100, text: 'Explain', hidden: true },
		          ],
		 columngroups: [
		                { name: 'Reference', text: 'Reference', align: 'center' },
		                { name: 'Prediction', text: 'Prediction', align: 'center' }
		                ]
	});
}

var kludgeIdName = function(s) {
	return s.replace(/[\+]/g, '_plus_').replace(/[ ]/g, '_space_');
}

var initEvaluationWidget = function() {
	var dataAdapter = new $.jqx.dataAdapter({
		dataType: 'json',
		dataFields: [
		             { name: 'id'      , type: 'number' },
		             { name: 'name'    , type: 'string' },
		             { name: 'value'   , type: 'array' },
		             { name: 'expanded', type: 'bool' },
		             { name: 'children', type: 'array' }
		            ],
		hierarchy: { root: 'children' },
		id: 'id',
		localData: global.data
	});
	$('#wid-evaluation').jqxTreeGrid({
		theme: THEME,
		showHeader: false,
		source: dataAdapter,
		columns: [
		          { text: '', dataField: 'name', width: 250 },
		          { text: '', dataField: 'value', width: 100, cellsAlign: 'center',
		        	cellsRenderer: function(row, column, value) {
		        		if ((typeof value) == 'string') {
		        			return value;
		        		}
		        		return '<button class="wid-show-pairs" id="wid-show-pairs__'+kludgeIdName(value.document)+'__'+kludgeIdName(value.eval)+'">Show Pairs</button>';
		        	}
		          }
		         ],
		rendering: function() {
    		$('.wid-show-pairs').remove();
		},
        rendered: function() {
        	if (global.detailed) {
        		for (var i = 1; i < global.data.length; ++i) {
        			var item = global.data[i];
        			for (var e = 0; e < item.children.length; ++e) {
        				var eval = item.children[e];
        				var bid = '#wid-show-pairs__'+kludgeIdName(item.name)+'__'+kludgeIdName(eval.name);
        				var btn = $(bid);
        				if (btn.length > 0) {
        					btn.jqxButton({ theme: THEME });
        					btn.on('click', handleShowPairsButton);
        				}
        			}
        		}
        	}
        }
	});
}

var initSubmissionNotifications = function() {
	$('#wid-congratulate').jqxNotification({
		theme: THEME,
		template: 'success',
		showCloseButton: false,
		autoClose: false,
		appendContainer: '#sec-evaluation-notifications'
	});
	$('#wid-ask-login').jqxNotification({
		theme: THEME,
		template: 'info',
		showCloseButton: false,
		autoClose: false,
		appendContainer: '#sec-evaluation-notifications'
	});
}

var handleResponse = function(event) {
	$('#wid-loader').jqxLoader('close');
	var response = JSON.parse(event.args.response);
//	console.log(response);
	if (response.evaluation && response.success) {
		$('#sec-output').jqxTabs('select', 0);
	}
	if (response.success) {
		var cont = $('#sec-messages');
		cont.append('<div class="help">No problems found in your submission</div>');
	}
	displayMessages(response);
	global['last-result'] = response;
	if (response.evaluation) {
		global.data = evaluationDataObjs(response);
		var cont = $('#sec-evaluation');
		cont.append('<div id="wid-evaluation"></div>');
		initEvaluationWidget();
		if (response.success) {
			if (global.notify.congratulate) {
				$('#wid-congratulate').jqxNotification('open');
				global.notify.congratulate = false;
			}
			if (global.notify['ask-login'] && !getAuthToken()) {
				$('#wid-ask-login').jqxNotification('open');
				global.notify['ask-login'] = false;
			}
		}
	}
	if (global.action == 'check' || !response.success) {
		$('#sec-output').jqxTabs('select', 1);
	}
}

var initUploadWidget = function() {
	var e = $('#wid-upload');

	e.jqxFileUpload({
		theme: THEME,
    	uploadUrl: 'api/run',
    	fileInputName: 'zipfile',
    	multipleFilesUpload: false,
    	accept: '.zip',
    	autoUpload: true,
    	width: 350,
    	browseTemplate: 'primary'
    });

	e.on('uploadStart', prepareUpload);
    e.on('uploadEnd', handleResponse);
}

var initLoaderWidget = function() {
	$('#wid-loader').jqxLoader({
		theme: THEME,
		text: ''
	});
}

var initOutputTabs = function() {
	$('#sec-output').jqxTabs({
		theme: THEME,
		width: '69%',
		autoHeight: true,
		selectionTracker: true,
		animationType: 'fade'
	});
	$('#sec-output').on('selected', function (event) {
		if (event.args.item == 2) {
			showSubmissions();
		}
	});
}

var _getCellClass = function(row, columnField, value, rowData) {
	if (rowData.last) {
		return 'my-last-submission';
	}
	if (rowData.me) {
		return 'my-submission';
	}
	return '';
}

var getTaskData = function() {
	var task = _getTask();
//	console.log(task);
	var width = 480;
	var dataFields = [
	                  { name: 'todo'        , type: 'bool' },
	                  { name: 'id'          , type: 'number' },
	                  { name: 'me'          , type: 'bool' },
	                  { name: 'last'        , type: 'bool' },
	                  { name: 'team'        , type: 'string' },
	                  { name: 'date'        , type: 'date' },
	                  { name: 'set'         , type: 'string' },
	                  { name: 'description' , type: 'string' },
	                  { name: 'priv'        , type: 'bool' }
	                  ];
	var tree = [
	            {
	            	id: 'team',
	            	label: 'Team',
	            	checked: true,
	            	items: []
	            },
	            {
	            	id: 'date',
	            	label: 'Date',
	            	checked: true,
	            	items: []
	            },
	            {
	            	id: 'set',
	            	label: 'Set',
	            	checked: true,
	            	items: []
	            },
	            {
	            	id: 'description',
	            	label: 'Description',
	            	checked: true,
	            	items: []
	            }
	            ];
	var columns = [
	               {
	            	   datafield: 'todo',
	            	   width: 50,
	            	   text: '',
	            	   align: 'center',
	            	   columntype: 'checkbox',
	            	   editable: true,
	            	   threestatecheckbox: false,
	            	   hidden: false
	               },
	               {
	            	   datafield: 'team',
	            	   width: 130,
	            	   text: 'Team',
	            	   align: 'center',
	            	   cellclassname: _getCellClass,
	            	   enabletooltips: true,
	            	   hidden: false
	               },
	               {
	            	   datafield: 'date',
	            	   width: 100,
	            	   text: 'Date',
	            	   align: 'center',
	            	   cellclassname: _getCellClass,
	            	   cellsformat: 'yyyy-MM-dd hh:mm:ss',
	            	   enabletooltips: true,
	            	   hidden: false
	               },
	               {
	            	   datafield: 'set',
	            	   width: 100,
	            	   text: 'Set',
	            	   align: 'center',
	            	   cellsalign: 'center',
	            	   cellclassname: _getCellClass,
	            	   enabletooltips: true,
	            	   hidden: false
	               },
	               {
	            	   datafield: 'description',
	            	   width: 100,
	            	   text: 'Description<br>(click to edit)',
	            	   cellclassname: _getCellClass,
	            	   enabletooltips: true,
	            	   hidden: false
	               }
	               ];
	var columnGroups = [];
	var helper = [];
	for (var i = 0; i < task.evaluations.length; ++i) {
		var eval = task.evaluations[i];
		var evalPrefix = eval.name + '__';
//		columnGroups.push({
//			name: eval.name,
//			text: eval.name
//		});
		for (var j = 0; j < eval.scorings.length; ++j) {
			var scoring = eval.scorings[j];
			var scoringColumnGroup = evalPrefix + scoring.name;
			columnGroups.push({
				name: scoringColumnGroup,
				text: scoring.name,
				align: 'center'
//				parentgroup: eval.name
			});
			var scoringTreeItems = [];
			tree.push({
				id: scoringColumnGroup,
				label: scoring.name,
				checked: j == 0,
				items: scoringTreeItems
			});
			var scoringPrefix = evalPrefix + scoring.name + '__';
			for (var k = 0; k < scoring.measures.length; ++k) {
				var measure = scoring.measures[k];
				var measureFieldName = scoringPrefix + measure.name;
				dataFields.push({
					name: measureFieldName,
					type: 'number'
				});
				var hidden = (i > 0 || j > 0);
				var aggregate;
				if (measure.higher) {
					aggregate = 'max';
				}
				else {
					aggregate = 'min';
				}
				columns.push({
					datafield: measureFieldName,
					width: 50,
					text: measure.name,
					columngroup: scoringColumnGroup,
					align: 'center',
					cellsalign: 'center',
					cellclassname: _getCellClass,
					enabletooltips: true,
					aggregates: [aggregate],
					hidden: hidden
				});
				scoringTreeItems.push({
					id: measureFieldName,
					label: measure.name,
					checked: !hidden,
					items: []
				});
				if (!hidden) {
					width += 50;
				}
				helper.push({
					eval: eval.name,
					scoring: scoring.name,
					measure: measure.name,
					field: measureFieldName
				});
			}
		}
	}
	return {
		dataFields: dataFields,
		columns: columns,
		columnGroups: columnGroups,
		width: width,
		helper: helper,
		tree: [
		       {
		    	   id: 'all',
		    	   label: 'Columns',
		    	   checked: null,
		    	   items: tree,
		    	   expanded: false
		       }
		      ]
	};
}

var getSubmissionsData = function(submissions, helper) {
	var result = [];
	for (var i = 0; i < submissions.length; ++i) {
		var sub = submissions[i];
		var last = global['last-result'] != null && global['last-result'].evaluation['submission-id'] == sub.id;
		var row = {
				id: sub.id,
				me: sub.me,
				last: last,
				team: sub.owner,
				date: sub.date,
				set: sub.set,
				priv: sub['private'],
				description: sub.description,
				todo: false
		};
		for (var j = 0; j < helper.length; ++j) {
			var h = helper[j];
			try {
				row[h.field] = sub.evaluations[h.eval][h.scoring][h.measure];
			}
			catch (err) {
				row[h.field] = null
			}
		}
		result.push(row);
	}
	return result;
}

var updateDescription = function (rowid, rowdata, commit) {
	if (rowdata.me) {
		$.ajax({
			url: getURLWithToken('api/submission/'+rowdata.id+'/set-description?description='+rowdata.description),
			error: function(xhr, status, error) {
				commit(false);
			},
			success: function(data, status, xhr) {
				commit(true);
			}	
		});
	}
	else {
		commit(false);
	}
}

var showSubmissions = function() {
	$('#wid-loader').jqxLoader('open');
	$.ajax({
		url: getURLWithToken('api/task/'+global.taskName+'/submissions'),
		error: function(xhr, status, error) {
			console.log(error);
		},
		success: function(data, status, xhr) {
			$('#wid-loader').jqxLoader('close');
			var taskData = getTaskData();
			
			$('#wid-tree').jqxTree('destroy');
			$('#sec-tree').append('<div id="wid-tree"></div>');
			$('#wid-tree').jqxTree({
				theme: THEME,
				source: taskData.tree,
				checkboxes: true,
				hasThreeStates: true,
				enableHover: false,
				toggleMode: 'click'
			});
			$('#wid-tree').on('checkChange', function (event) {
                var item = $('#wid-tree').jqxTree('getItem', event.args.element);
                if (item.checked == true) {
                	$('#wid-submissions').jqxGrid('showcolumn', item.id);
                }
                if (item.checked == false) {
                	$('#wid-submissions').jqxGrid('hidecolumn', item.id);
                }
			});
			
			$('#wid-submissions').jqxGrid('destroy');
			$('#sec-compare').append('<div id="wid-submissions"></div>');
			var submissionsData = getSubmissionsData(data.submissions, taskData.helper);
			var cellBeginEdit = function(row, datafield, columntype, value) {
				return (datafield == 'description' || datafield == 'todo') && submissionsData[row].me;
			}
			var cellsRenderer = function(rowNum, columnField, value, defaultHTML, columnProperties, data) {
				if (columnField == 'todo' && !data.me) {
				}
				return defaultHTML;
			}
			for (var i = 0; i < taskData.columns.length; ++i) {
				var col = taskData.columns[i];
				col.cellbeginedit = cellBeginEdit;
				//col.cellsrenderer = cellsRenderer;
			}
			var dataAdapter = new $.jqx.dataAdapter({
				dataType: 'json',
				dataFields: taskData.dataFields,
				id: 'id',
				localData: getSubmissionsData(data.submissions, taskData.helper),
				updaterow: updateDescription
			});
			$('#wid-submissions').jqxGrid({
				theme: THEME,
				source: dataAdapter,
		        columnsresize: true,
		        sortable: true,
		        filterable: true,
		        groupable: true,
		        pageable: true,
		        pagesize: 20,
		        pagesizeoptions: ['20', '50', '100'],
		        showaggregates: true,
		        showstatusbar: true,
		        statusbarheight: 25,
		        autoheight: true,
		        width: taskData.width,
		        editable: true,
		        enabletooltips: true,
				columns: taskData.columns,
				columngroups: taskData.columnGroups,
			});
		}
	});
}

var updateSubmissions = function() {
	if ($('#sec-output').jqxTabs('val') == 2) {
		showSubmissions();
	}
}

var initTree = function() {
	$('#wid-show-tree').jqxButton({
		theme: THEME
	});
	
	$('#sec-tree').jqxPopover({
		theme: THEME,
		showCloseButton: true,
		selector: $('#wid-show-tree'),
		animationType: 'fade',
		position: 'left',
		title: 'Show/Hide columns',
		width: 250,
		showArrow: false
	});
}

var initDeleteSubmissions = function() {
	$('#wid-delete-submissions').jqxButton({
		theme: THEME
	});
	$('#wid-delete-submissions').on('click', function(event) {
		var rows = $('#wid-submissions').jqxGrid('getrows');
		var queryParams = '';
		for (var i = 0; i < rows.length; ++i) {
			var sub =rows[i];
			if (sub.todo) {
				var prefix;
				if (queryParams == '') {
					prefix = '?id=';
				}
				else {
					prefix = ',';
				}
				queryParams = queryParams + prefix + sub.id;
			}
		}
		if (queryParams == '') {
			return;
		}
		$.ajax({
			url: getURLWithToken('api/delete-submissions' + queryParams),
			success: function(data, status, xhr) {
				displayMessages(data);
				if (data.success) {
					updateSubmissions();
				}
				else {
					$('#sec-output').jqxTabs('select', 1);
				}
			}
		});
	});
}

//HEROTHEME = 'darkblue';
HEROTHEME = 'highcontrast';
//HEROTHEME = 'metrodark';
//HEROTHEME = 'orange';
//HEROTHEME = 'ui-smoothness';

var initHero = function() {
	$('#sec-hero').jqxExpander({
		theme: HEROTHEME,
		width: '70%'
	});
}

var TOOLTIPS = 
[
 {
	 selector: '#help-task',
	 contents: 'Select the task of your submission.'
 },
 {
	 selector: '#help-set',
	 contents: 'Select the set on which you made predictions. The test set may not be available yet.'
 },
 {
	 selector: '#help-action',
	 contents: 'Chose the action you want to perform. <em>Evaluate</em> will compute scores for your prediction against reference annotations. <em>Check</em> will verify the well-formedness of your prediction files.'
 },
 {
	 selector: '#label-detailed',
	 contents: 'Check this if you wish scores for each document and explore predicted-reference annotation pairings.'
 },
 {
	 selector: '#help-upload',
	 contents: 'Upload a zip archive containing one a2 file for each document in the working set.'
 },
 {
	 selector: '#tab-result',
	 contents: 'Scores for the last submission uploaded.'
 },
 {
	 selector: '#tab-messages',
	 contents: 'Warning and errors raised by the last submission uploaded'
 },
 {
	 selector: '#tab-compare',
	 contents: 'Compare submissions, yours and other\'s'
 }
];

var initTooltips = function(tooltips) {
	for (var i = 0; i < tooltips.length; ++i) {
		var tt = tooltips[i];
		if (tt.selector) {
			$(tt.selector).jqxTooltip({
				theme: THEME,
				content: tt.contents,
				position: 'mouse'
			});
		}
	}
}

var initWidgets = function() {
	initHero();
	initTasksWidget();
    initSetsWidget();
    initActionWidget();
    initDetailedWidget();
//    initAlternateWidget();
    initUploadWidget();
    initLoaderWidget();
    initNotificationWidget();
    initOutputTabs();
    initTree();
    initDeleteSubmissions();
    initSubmissionNotifications();
    initTooltips(TOOLTIPS);
}

var gapi;

$(document).ready(function () {
	if (gapi) {
		gapi.load('auth2', function() {
			global.auth2 = gapi.auth2.init({
				client_id: '1074131217576-go8od7l068ntmvapkh7erd7mu6c0kg96.apps.googleusercontent.com',
				fetch_basic_profile: true,
				scope: 'profile'
			});
			global.auth2.isSignedIn.listen(function(status) {
				if (status) {
					if (global['last-result'] && global['last-result'].evaluation && global['last-result'].evaluation['submission-id']) {
						$.ajax({
							url: getURLWithToken('api/submission/'+global['last-result'].evaluation['submission-id']+'/set-owner'),
							success: function(data, status, xhr) {
								displayMessages(data);
								if (data.success) {
									updateSubmissions();
								}
								else {
									$('#sec-output').jqxTabs('select', 1);
								}
							}
						});
					}
				}
				else {
					global['last-result'] = null;
					updateSubmissions();
				}
			});
		});
	}
	initWidgets();
});
