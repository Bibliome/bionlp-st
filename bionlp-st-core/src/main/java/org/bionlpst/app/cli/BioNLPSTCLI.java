package org.bionlpst.app.cli;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.bionlpst.BioNLPSTException;
import org.bionlpst.app.Task;
import org.bionlpst.corpus.Annotation;
import org.bionlpst.corpus.Corpus;
import org.bionlpst.corpus.Document;
import org.bionlpst.corpus.source.ContentAndReferenceSource;
import org.bionlpst.corpus.source.PredictionSource;
import org.bionlpst.corpus.source.bionlpst.BioNLPSTSource;
import org.bionlpst.corpus.source.bionlpst.DirectoryInputStreamCollection;
import org.bionlpst.corpus.source.bionlpst.InputStreamCollection;
import org.bionlpst.corpus.source.bionlpst.ZipFileInputStreamCollection;
import org.bionlpst.corpus.source.pubannotation.FileInputStreamFactory;
import org.bionlpst.corpus.source.pubannotation.PubAnnotationSource;
import org.bionlpst.corpus.writer.BioNLPSTWriter;
import org.bionlpst.corpus.writer.PubAnnotationWriter;
import org.bionlpst.evaluation.AnnotationEvaluation;
import org.bionlpst.evaluation.BootstrapConfig;
import org.bionlpst.evaluation.EvaluationResult;
import org.bionlpst.evaluation.Measure;
import org.bionlpst.evaluation.Scoring;
import org.bionlpst.util.Location;
import org.bionlpst.util.message.CheckLogger;
import org.bionlpst.util.message.CheckMessage;
import org.bionlpst.util.message.CheckMessageLevel;
import org.codehaus.jettison.json.JSONException;

public class BioNLPSTCLI {
	private static final Location COMMAND_LINE_LOCATION = new Location("", -1);
	private final CheckLogger logger = new CheckLogger();
	private String taskName = null;
	private Task task = null;
	private String set = null;
	private ContentAndReferenceSource referenceSource = null;
	private PredictionSource predictionSource = null;
	private boolean pubAnnotationPredictions = false;
	private boolean detailedEvaluation = false;
	private boolean alternateScores = false;
	private boolean forceEvaluation = false;
	private Action action = Action.EVALUATE;
	private EvaluationResultWriter evalWriter = StandardEvaluationResultWriter.INSTANCE;
	private Integer bootstrapResamples = null;
	private double confidenceIntervalP = 0.95;
	private long bootstrapRandomSeed = System.currentTimeMillis();
	private BootstrapConfig bootstrapConfig = null;
	private File outputDir = null;
	private String sourcedb = null;

	private static enum Action {
		EVALUATE,
		CHECK,
		HELP,
		LIST_TASKS,
		WRITE;
	}
	
	public static void main(String[] args) throws Exception {
		BioNLPSTCLI cli = new BioNLPSTCLI();
		cli.parseArgs(args);
		cli.run();
	}
	
	private void run() throws Exception {
		switch (action) {
			case EVALUATE: {
				doCheckAndEvaluate(true);
				exit(0);
				break;
			}
			case CHECK: {
				doCheckAndEvaluate(false);
				exit(0);
				break;
			}
			case HELP: {
				doHelp();
				exit(0);
				break;
			}
			case LIST_TASKS: {
				if (taskName == null) {
					doListTasks();
				}
				else {
					if (task != null) {
						displayTask(task);
					}
				}
				exit(0);
				break;
			}
			case WRITE: {
				doWrite();
				exit(0);
				break;
			}
		}
	}
	
	private void doWrite() throws BioNLPSTException, IOException, JSONException {
		if (task == null) {
			exit(1);
		}
		logger.information(COMMAND_LINE_LOCATION, "loading corpus and reference data");
		Corpus corpus = loadReference(true);
		flushLogger();
		
		logger.information(COMMAND_LINE_LOCATION, "resolving references");
		corpus.resolveReferences(logger);
		flushLogger();
		
		if (outputDir != null) {
			logger.information(COMMAND_LINE_LOCATION, "writing annotations in BioNLP-ST format into " + outputDir);
			BioNLPSTWriter.write(corpus, outputDir);
		}
		
		if (sourcedb != null) {
			logger.information(COMMAND_LINE_LOCATION, "writing annotations in PubAnnotation format into standard output");
			PubAnnotationWriter.write(corpus, sourcedb);
		}
		
		flushLogger();
	}

	private static void doHelp() {
		try (InputStream is = BioNLPSTCLI.class.getResourceAsStream("BioNLPSTCLIHelp.txt")) {
			Reader r = new InputStreamReader(is);
			BufferedReader br = new BufferedReader(r);
			while (true) {
				String line = br.readLine();
				if (line == null) {
					break;
				}
				System.out.println(line);
			}
		}
		catch (IOException e) {
			e.printStackTrace(System.err);
		}
	}

	private void doCheckAndEvaluate(boolean evaluate) throws Exception {
		if (task == null) {
			exit(1);
		}
		logger.information(COMMAND_LINE_LOCATION, "loading corpus and reference data");
		Corpus corpus = loadReference(evaluate);
		flushLogger();

		logger.information(COMMAND_LINE_LOCATION, "loading prediction data");
		predictionSource.fillPredictions(logger, corpus);
		flushLogger();
		
		logger.information(COMMAND_LINE_LOCATION, "resolving references");
		corpus.resolveReferences(logger);
		flushLogger();

		logger.information(COMMAND_LINE_LOCATION, "checking data");
		Task.checkParsedPredictions(logger, corpus, predictionSource.getName());
		task.checkSchema(logger, corpus);
		CheckMessageLevel highestLevel = logger.getHighestLevel();
		flushLogger();
		if (evaluate) {
			if (highestLevel != CheckMessageLevel.INFORMATION) {
				if (forceEvaluation) {
					logger.serious(COMMAND_LINE_LOCATION, "I will evaluate this garbage because you made me to");
					flushLogger();
				}
				else {
					logger.serious(COMMAND_LINE_LOCATION, "I refuse to evaluate this garbage");
					flushLogger();
					exit(1);
				}
			}
			doEvaluate(corpus);
		}
		else {
			if (highestLevel != CheckMessageLevel.INFORMATION) {
				exit(1);
			}
		}
	}

	private void doEvaluate(Corpus corpus) {
		logger.information(COMMAND_LINE_LOCATION, "postprocessing");
		task.getCorpusPostprocessing().postprocess(corpus);
		logger.information(COMMAND_LINE_LOCATION, "evaluation");
		if (bootstrapResamples != null) {
			logger.information(COMMAND_LINE_LOCATION, String.format("bootstrap configuration: resamples = %d, confidence = %.2f, seed = %d", bootstrapResamples, confidenceIntervalP, bootstrapRandomSeed));
			bootstrapConfig = new BootstrapConfig(new Random(bootstrapRandomSeed), bootstrapResamples);
		}
		flushLogger();
		if (detailedEvaluation) {
			for (Document doc : corpus.getDocuments()) {
				doEvaluateDocument(doc);
			}
		}
		doEvaluateCorpus(corpus);
	}

	private void doEvaluateCorpus(Corpus corpus) {
		evalWriter.displayCorpusHeader(referenceSource, set);
		if (alternateScores) {
			Map<String,EvaluationResult<Annotation>> evalMap = task.evaluate(logger, corpus, false, bootstrapConfig);
			for (EvaluationResult<Annotation> eval : evalMap.values()) {
				evalWriter.displayEvaluationResult(eval, false, (bootstrapConfig == null ? -1.0 : confidenceIntervalP));
			}
		}
		else {
			EvaluationResult<Annotation> eval = task.evaluateMain(logger, corpus, false, bootstrapConfig);
			evalWriter.displayEvaluationResult(eval, false, (bootstrapConfig == null ? -1.0 : confidenceIntervalP));
		}
	}

	private void doEvaluateDocument(Document doc) {
		evalWriter.displayDocumentHeader(doc);
		if (alternateScores) {
			Map<String,EvaluationResult<Annotation>> evalMap = task.evaluate(logger, doc, true, bootstrapConfig);
			for (EvaluationResult<Annotation> eval : evalMap.values()) {
				evalWriter.displayEvaluationResult(eval, detailedEvaluation, (bootstrapConfig == null ? -1.0 : confidenceIntervalP));
			}
		}
		else {
			EvaluationResult<Annotation> eval = task.evaluateMain(logger, doc, true, bootstrapConfig);
			evalWriter.displayEvaluationResult(eval, detailedEvaluation, (bootstrapConfig == null ? -1.0 : confidenceIntervalP));
		}
	}

	@SuppressWarnings("static-method")
	private void doListTasks() throws Exception {
		Map<String,Task> taskMap = Task.loadTasks();
		for (Task task : taskMap.values()) {
			displayTask(task);
		}
	}
	
	private static void displayTask(Task task) {
		System.out.println(task.getName());
		for (AnnotationEvaluation eval : task.getEvaluations()) {
			System.out.println("  " + eval.getName());
			for (Scoring<Annotation> scoring : eval.getScorings()) {
				System.out.print("    " + scoring.getName() + ":");
				for (Measure measure : scoring.getMeasures()) {
					System.out.print(' ');
					System.out.print(measure.getName());
				}
				System.out.println();
			}
		}
	}

	private Corpus loadReference(boolean loadOutput) throws BioNLPSTException, IOException {
		if (referenceSource != null) {
			return referenceSource.fillContentAndReference(logger, loadOutput);
		}
		switch (set) {
			case "train": return task.getTrainCorpus(logger);
			case "dev": return task.getDevCorpus(logger);
			case "train+dev": return task.getTrainAndDevCorpus(logger);
			case "test": {
				if (!task.hasTest()) {
					logger.serious(COMMAND_LINE_LOCATION, "test set is not available for " + task.getName());
					exit(1);
				}
				if (loadOutput && !task.isTestHasReferenceAnnotations()) {
					logger.serious(COMMAND_LINE_LOCATION, "test set has no reference annotations for " + task.getName());
					exit(1);
				}
				return task.getTestCorpus(logger);
			}
			default: {
				throw new RuntimeException();
			}
		}
	}
	
	private Task getSelectedTask() throws Exception {
		Task result = Task.loadTask(taskName);
		if (result == null) {
			logger.serious(COMMAND_LINE_LOCATION, "unknown task: " + taskName);
		}
		return result;
	}
	
	private void exit(int retval) {
		flushLogger();
		System.exit(retval);
	}
	
	private void flushLogger() {
		for (CheckMessage msg : logger.getMessages()) {
			System.err.println(msg.getCompleteMessage());
		}
		logger.clear();
	}
	
	private void parseArgs(String[] args) {
		List<String> argList = Arrays.asList(args);
		Iterator<String> argIt = argList.iterator();
		while (parseNext(argIt)) {}
		if (!finishArgs()) {
			exit(1);
		}
	}
	
	private boolean parseNext(Iterator<String> argsIt) {
		if (argsIt.hasNext()) {
			String opt = argsIt.next();
			switch (opt) {
				case "-task": {
					if (taskName != null) {
						logger.serious(COMMAND_LINE_LOCATION, "duplicate option: -task");
					}
					taskName = requireArgument(argsIt, opt, taskName);
					if (taskName != null) {
						try {
							task = getSelectedTask();
						}
						catch (Exception e) {
							logger.serious(COMMAND_LINE_LOCATION, "something went wrong while loading task definitions: " + e.getMessage());
						}
					}
					break;
				}
				case "-train":
				case "-dev":
				case "-train+dev":
				case "-test": {
					String set = opt.substring(1);
					if (this.set != null) {
						if (set.equals(this.set)) {
							logger.suspicious(COMMAND_LINE_LOCATION, "duplicate option: " + opt);
						}
						else {
							logger.suspicious(COMMAND_LINE_LOCATION, "conflicting options: -" + this.set + " " + opt);
						}
					}
					this.set = set;
					break;
				}
				case "-reference": {
					if (referenceSource != null) {
						logger.suspicious(COMMAND_LINE_LOCATION, "duplicate option: " +opt);
					}
					if (set != null) {
						logger.suspicious(COMMAND_LINE_LOCATION, "conflicting options: -" + this.set + " " + opt);
					}
					String arg = requireArgument(argsIt, opt, null);
					if (arg != null) {
						referenceSource = new BioNLPSTSource(getInputStreamCollection(arg));
					}
					break;
				}
				case "-pubannotation": {
					if (pubAnnotationPredictions) {
						logger.suspicious(COMMAND_LINE_LOCATION, "duplicate option: " + opt);
					}
					if (predictionSource != null) {
						logger.suspicious(COMMAND_LINE_LOCATION, "option -pubannotation occurs after -prediction");
					}
					pubAnnotationPredictions = true;
					break;
				}
				case "-prediction": {
					if (predictionSource != null) {
						logger.suspicious(COMMAND_LINE_LOCATION, "duplicate option: " + opt);
					}
					String arg = requireArgument(argsIt, opt, null);
					if (arg != null) {
						if (pubAnnotationPredictions) {
							predictionSource = new PubAnnotationSource(new FileInputStreamFactory(new File(arg)));
						}
						else {
							predictionSource = new BioNLPSTSource(getInputStreamCollection(arg));
						}
					}
					break;
				}
				case "-detailed": {
					if (detailedEvaluation) {
						logger.suspicious(COMMAND_LINE_LOCATION, "duplicate option: " + opt);
					}
					detailedEvaluation = true;
					break;
				}
				case "-tabular": {
					if (evalWriter != StandardEvaluationResultWriter.INSTANCE) {
						logger.suspicious(COMMAND_LINE_LOCATION, "duplicate option: " + opt);
					}
					evalWriter = new TabularEvaluationResultWriter();
					break;
				}
				case "-pairing": {
					if (evalWriter != StandardEvaluationResultWriter.INSTANCE) {
						logger.suspicious(COMMAND_LINE_LOCATION, "duplicate option: " + opt);
					}
					detailedEvaluation = true;
					evalWriter = EvaluationPairingWriter.INSTANCE;
					break;
				}
				case "-check": {
					action = Action.CHECK;
					break;
				}
				case "-help": {
					action = Action.HELP;
					break;
				}
				case "-list-tasks": {
					action = Action.LIST_TASKS;
					break;
				}
				case "-write-bionlpst": {
					action = Action.WRITE;
					String arg = requireArgument(argsIt, opt, null);
					outputDir = new File(arg);
					break;
				}
				case "-write-pubannotation": {
					action = Action.WRITE;
					sourcedb = requireArgument(argsIt, opt, null);
					break;
				}
				case "-alternate": {
					alternateScores = true;
					break;
				}
				case "-force": {
					forceEvaluation = true;
					break;
				}
				case "-resamples": {
					if (bootstrapResamples != null) {
						logger.suspicious(COMMAND_LINE_LOCATION, "duplicate option: " + opt);
					}
					String arg = requireArgument(argsIt, opt, null);
					if (arg != null) {
						try {
							bootstrapResamples = Integer.parseInt(arg);
							if (bootstrapResamples < 0) {
								logger.serious(COMMAND_LINE_LOCATION, opt + " expects a positive non-zero integer");
							}
						}
						catch (NumberFormatException e) {
							logger.serious(COMMAND_LINE_LOCATION, opt + " expects a positive non-zero integer");
						}
					}
					break;
				}
				case "-bootstrap-seed": {
					String arg = requireArgument(argsIt, opt, null);
					if (arg != null) {
						try {
							bootstrapRandomSeed = Long.parseLong(arg);
						}
						catch (NumberFormatException e) {
							logger.serious(COMMAND_LINE_LOCATION, opt + " expects an integer");
						}
					}
					break;
				}
				case "-confidence": {
					String arg = requireArgument(argsIt, opt, null);
					if (arg != null) {
						try {
							confidenceIntervalP = Double.parseDouble(arg);
							if (confidenceIntervalP < 0) {
								logger.serious(COMMAND_LINE_LOCATION, opt + " expects a probability");
							}
						}
						catch (NumberFormatException e) {
							logger.serious(COMMAND_LINE_LOCATION, opt + " expects a probability");
						}
					}
					break;
				}
				default: {
					if (opt.charAt(0) == '-') {
						logger.serious(COMMAND_LINE_LOCATION, "unknown option: " + opt);
					}
					else {
						logger.serious(COMMAND_LINE_LOCATION, "junk argument: " + opt);
					}
					break;
				}
			}
			return true;
		}
		return false;
	}

	private String requireArgument(Iterator<String> argsIt, String opt, String defaultValue) {
		if (argsIt.hasNext()) {
			return argsIt.next();
		}
		logger.serious(COMMAND_LINE_LOCATION, opt + " requires argument");
		return defaultValue;
	}
	
	private static InputStreamCollection getInputStreamCollection(String arg) {
		File f = new File(arg);
		if (f.isDirectory()) {
			return new DirectoryInputStreamCollection(f);
		}
		return new ZipFileInputStreamCollection(f);
	}

	private boolean finishArgs() {
		boolean result = true;
		if (action == Action.LIST_TASKS || action == Action.HELP) {
			return result;
		}
		if (taskName == null) {
			logger.serious(COMMAND_LINE_LOCATION, "option -task is mandatory");
			result = false;
		}
		else {
			if (task == null) {
				result = false;
			}
		}
		if (set == null && referenceSource == null) {
			logger.serious(COMMAND_LINE_LOCATION, "either one of these options is required: -train -dev -test -reference");
			result = false;
		}
		if (referenceSource != null) {
			set = null;
		}
		else if (set != null && set.equals("test") && detailedEvaluation) {
			logger.tolerable(COMMAND_LINE_LOCATION, "option -detailed is not compatible with test evaluation");
			detailedEvaluation = false;
		}
		if (action == Action.WRITE) {
			return result;
		}
		if (predictionSource == null) {
			logger.serious(COMMAND_LINE_LOCATION, "option -prediction is mandatory");
			result = false;
		}
		return result;
	}
}
