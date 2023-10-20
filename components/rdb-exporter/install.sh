#!/bin/bash

set -eu

EMBULK_EXEC_PATH=${DECOMPRESSED_PATH}/embulk-${EMBULK_VERSION}.jar
JRUBY_EXEC_PATH=${DECOMPRESSED_PATH}/jruby-complete-9.3.11.0.jar

echo "Emublk Exec Path: ${EMBULK_EXEC_PATH}"
echo $HOME

DIR_PATH="$HOME/.embulk"; [ -d "$DIR_PATH" ] && rm -rf "$DIR_PATH"; mkdir "$DIR_PATH"

echo "Installing embulk..."
curl --create-dirs -o ${EMBULK_EXEC_PATH} -L "https://dl.embulk.org/embulk-$EMBULK_VERSION.jar"
chmod +x ${EMBULK_EXEC_PATH}

echo "Installing jruby..."
curl -o ${JRUBY_EXEC_PATH} -L https://repo1.maven.org/maven2/org/jruby/jruby-complete/9.3.11.0/jruby-complete-9.3.11.0.jar
echo "jruby=file:///${JRUBY_EXEC_PATH}" >> ${HOME}/.embulk/embulk.properties

echo "Installing embulk plugins..."
java -jar ${EMBULK_EXEC_PATH} gem install embulk -v ${EMBULK_VERSION}
java -jar ${EMBULK_EXEC_PATH} gem install msgpack -v 1.4.1
java -jar ${EMBULK_EXEC_PATH} gem install embulk-input-postgresql
java -jar ${EMBULK_EXEC_PATH} gem install embulk-output-s3
java -jar ${EMBULK_EXEC_PATH} gem install liquid -v 4.0.0
chmod +x ${DECOMPRESSED_PATH}/src/main.py

echo "Installing python packages..."
python3 -m pip install -v -r ${DECOMPRESSED_PATH}/requirements.txt