package org.bionlpst.corpus.source;

import java.io.IOException;

import org.bionlpst.BioNLPSTException;
import org.bionlpst.corpus.Corpus;
import org.bionlpst.util.Named;
import org.bionlpst.util.message.CheckLogger;

public interface PredictionSource extends Named {
	void fillPredictions(CheckLogger logger, Corpus corpus) throws BioNLPSTException, IOException;
}