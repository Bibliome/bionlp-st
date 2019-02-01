package org.bionlpst.app.web;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Random;

import javax.ws.rs.Consumes;
import javax.ws.rs.DefaultValue;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;

import org.bionlpst.BioNLPSTException;
import org.bionlpst.app.Task;
import org.bionlpst.app.source.CorpusSource;
import org.bionlpst.app.web.json.CheckMessageJsonConverter;
import org.bionlpst.app.web.json.EvaluationResultJsonConverter;
import org.bionlpst.app.web.json.JsonConverter;
import org.bionlpst.app.web.json.ListJsonConverter;
import org.bionlpst.app.web.json.TaskJsonConverter;
import org.bionlpst.corpus.Annotation;
import org.bionlpst.corpus.Corpus;
import org.bionlpst.corpus.Document;
import org.bionlpst.corpus.DocumentCollection;
import org.bionlpst.evaluation.BootstrapConfig;
import org.bionlpst.evaluation.EvaluationResult;
import org.bionlpst.util.Location;
import org.bionlpst.util.message.CheckLogger;
import org.bionlpst.util.message.CheckMessageLevel;
import org.codehaus.jettison.json.JSONArray;
import org.codehaus.jettison.json.JSONObject;

import com.sun.jersey.core.header.FormDataContentDisposition;
import com.sun.jersey.multipart.FormDataParam;

@Path("")
public class BioNLPSTRest {
	private static final Location REST_URL_LOCATION = new Location("Request URL", 0);
	
	private final Map<String,Task> taskMap;
	private final CheckLogger logger = new CheckLogger();
	private Task task = null;
	private Corpus corpus = null;
	private BootstrapConfig bootstrapConfig = null;

	public BioNLPSTRest() throws Exception {
		super();
		ClassLoader classLoader = getClass().getClassLoader();
		taskMap = Task.loadTasks(classLoader);
		try (InputStream is = getPropertiesResourcesAsStream(classLoader)) {
			Properties props = new Properties();
			props.load(is);
		}
	}
	
	private static InputStream getPropertiesResourcesAsStream(ClassLoader classLoader) throws UnknownHostException {
		String user = System.getenv("USER");
		String host = System.getenv("HOSTNAME");
		if (host == null) {
			host = InetAddress.getLocalHost().getHostName();
		}
		for (String name : getPropertiesResourceNames(user, host)) {
			String resName = "org/bionlpst/app/web/" + name + ".properties";
			InputStream result = classLoader.getResourceAsStream(resName);
			if (result != null) {
				return result;
			}
		}
		throw new RuntimeException();
	}
	
	private static String[] getPropertiesResourceNames(String user, String host) {
		return new String[] {
			user + "@" + host,
			host,
			user,
			"default",
			"rest"
		};
	}
	
	@GET
	@Path("list-tasks")
	@Produces(MediaType.APPLICATION_JSON)
	public String listTasks() throws Exception {
		JSONArray result = ListJsonConverter.convert(TaskJsonConverter.INSTANCE, taskMap.values());
		return result.toString(4);
	}
	
	@POST
	@Path("task/{taskName}/{set:train|dev|traindev|test}/check")
	@Consumes({MediaType.MULTIPART_FORM_DATA, "application/zip"})
	@Produces(MediaType.APPLICATION_JSON)
	public String checkSubmission(
			@PathParam("taskName") String taskName,
			@PathParam("set") String set,
			@FormDataParam("zipfile") InputStream zipStream,
			@FormDataParam("zipfile") FormDataContentDisposition zipInfo
			) throws Exception {
		start(taskName, set, zipStream, zipInfo, null, null);
		return finish(new JSONObject());
	}
	
	private void start(String taskName, String set, InputStream zipStream, FormDataContentDisposition zipInfo, Integer resamples, Long seed) throws BioNLPSTException, IOException {
		task = selectTask(taskName);
		corpus = loadReference(set);
		loadAndCheckPredictions(zipStream, zipInfo);
		task.getCorpusPostprocessing().postprocess(corpus);
		bootstrapConfig = getBootstrapConfig(resamples, seed);
	}

	private static BootstrapConfig getBootstrapConfig(Integer resamples, Long seed) {
		if (resamples == null || resamples == 0) {
			return null;
		}
		Random random = seed == null ? new Random() : new Random(seed);
		return new BootstrapConfig(random, resamples);
	}
	
	private Task selectTask(String taskName) {
		if (taskMap.containsKey(taskName)) {
			return taskMap.get(taskName);
		}
		logger.serious(REST_URL_LOCATION, "unknown task: " +taskName);
		return null;
	}
	
	private Corpus loadReference(String set) throws BioNLPSTException, IOException {
		if (task == null) {
			return null;
		}
		switch (set) {
			case "train": return task.getTrainCorpus(logger);
			case "dev": return task.getDevCorpus(logger);
			case "train+dev": return task.getTrainAndDevCorpus(logger);
			case "test": {
				if (!task.hasTest()) {
					logger.serious(REST_URL_LOCATION, "test set is not available for " + task.getName());
					return null;
				}
				return task.getTestCorpus(logger);
			}
			default: {
				throw new RuntimeException("unknown set: " + set);
			}
		}
	}
	
	private void loadAndCheckPredictions(InputStream zipStream, FormDataContentDisposition zipInfo) throws BioNLPSTException, IOException {
		if (task == null || corpus == null) {
			return;
		}
		CorpusSource predictionSource = new ZipFileUploadCorpusSource(zipStream, zipInfo.getFileName());
		predictionSource.getPredictions(logger, corpus);
		corpus.resolveReferences(logger);
		Task.checkParsedPredictions(logger, corpus, zipInfo.getFileName());
		task.checkSchema(logger, corpus);
	}
	
	private String finish(JSONObject result) throws Exception {
		result.put("messages", ListJsonConverter.convert(CheckMessageJsonConverter.INSTANCE, logger.getMessages()));
		CheckMessageLevel level = logger.getHighestLevel();
		result.put("highest-message-level", level);
		result.put("success", level == null || level == CheckMessageLevel.INFORMATION);
		return result.toString(4);
	}

	@POST
	@Path("task/{taskName}/{set:train|dev|traindev|test}/evaluate")
	@Consumes(MediaType.MULTIPART_FORM_DATA)
	@Produces(MediaType.TEXT_HTML)
	public String evaluateSubmission(
			@PathParam("taskName") String taskName,
			@PathParam("set") String set,
			@FormDataParam("zipfile") InputStream zipStream,
			@FormDataParam("zipfile") FormDataContentDisposition zipInfo,
			@FormDataParam("detailed") @DefaultValue("false") Boolean detailed,
			@FormDataParam("alternate") @DefaultValue("false") Boolean alternate,
			@FormDataParam("resamples") @DefaultValue("") Integer resamples,
			@FormDataParam("token") @DefaultValue("") String token
			) throws Exception {
		start(taskName, set, zipStream, zipInfo, resamples, null);
		JSONObject result = new JSONObject();
		if (task != null && corpus != null) {
			result.put("evaluation", doEvaluation(task, set, corpus, detailed, alternate));
		}
		return finish(result);
	}
	
	private JSONObject doEvaluation(Task task, String set, Corpus corpus, boolean detailed, boolean alternate) throws Exception {
		if (set.equals("test") && !task.isTestHasReferenceAnnotations()) {
			logger.serious(REST_URL_LOCATION, "test set has no reference annotations for " + task.getName());
			return new JSONObject();
		}
		JSONObject result = new JSONObject();
		if (detailed) {
			DocumentJsonConverter converter = new DocumentJsonConverter(alternate);
			result.put("detail", ListJsonConverter.convert(converter, corpus.getDocuments()));
		}
		JsonConverter<EvaluationResult<Annotation>> converter = new EvaluationResultJsonConverter(false);
		List<EvaluationResult<Annotation>> evaluationResults = getEvaluationResults(task, alternate, corpus, false, bootstrapConfig);
		result.put("global-evaluations", ListJsonConverter.convert(converter, evaluationResults));
		return result;
	}

	private class DocumentJsonConverter implements JsonConverter<Document> {
		private final boolean alternate;
		private final JsonConverter<EvaluationResult<Annotation>> converter = new EvaluationResultJsonConverter(true);
		
		private DocumentJsonConverter(boolean alternate) {
			super();
			this.alternate = alternate;
		}

		@Override
		public JSONObject convert(Document doc) throws Exception {
			JSONObject result = new JSONObject();
			result.put("document", doc.getId());
			result.put("evaluations", ListJsonConverter.convert(converter, getEvaluationResults(task, alternate, doc, true, bootstrapConfig)));
			return result;
		}
	}

	private List<EvaluationResult<Annotation>> getEvaluationResults(Task task, boolean alternate, DocumentCollection documentCollection, boolean pairs, BootstrapConfig bootstrap) {
		if (alternate) {
			Map<String,EvaluationResult<Annotation>> evaluationResultMap = task.evaluate(logger, documentCollection, pairs, bootstrap);
			return new ArrayList<EvaluationResult<Annotation>>(evaluationResultMap.values());
		}
		EvaluationResult<Annotation> evaluationResult = task.evaluateMain(logger, documentCollection, pairs, bootstrap);
		return Collections.singletonList(evaluationResult);
	}
	
	@POST
	@Path("run")
	@Consumes(MediaType.MULTIPART_FORM_DATA)
	@Produces(MediaType.TEXT_HTML)
	public String run(
			@FormDataParam("zipfile") InputStream zipStream,
			@FormDataParam("zipfile") FormDataContentDisposition zipInfo,
			@FormDataParam("taskName") String taskName,
			@FormDataParam("set") String set,
			@FormDataParam("detailed") @DefaultValue("false") Boolean detailed,
			@FormDataParam("alternate") @DefaultValue("false") Boolean alternate,
			@FormDataParam("action") @DefaultValue("evaluate") String action,
			@FormDataParam("resamples") @DefaultValue("") Integer resamples,
			@FormDataParam("token") @DefaultValue("") String token
			) throws Exception {
		switch (action) {
			case "check": return checkSubmission(taskName, set, zipStream, zipInfo);
			case "evaluate": return evaluateSubmission(taskName, set, zipStream, zipInfo, detailed, alternate, resamples, token);
			default: throw new BioNLPSTException("unknown action: " + action);
		}
	}
}
