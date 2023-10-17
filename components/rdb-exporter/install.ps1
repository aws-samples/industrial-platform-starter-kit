$DECOMPRESSED_PATH = $Env:DECOMPRESSED_PATH
$EMBULK_VERSION = $Env:EMBULK_VERSION
$EMBULK_EXEC_PATH = "$DECOMPRESSED_PATH\embulk-$EMBULK_VERSION.jar"
$JRUBY_EXEC_PATH = "$DECOMPRESSED_PATH\jruby-complete-9.3.11.0.jar"

Write-Host "Embulk Exec Path: $EMBULK_EXEC_PATH"
Write-Host $HOME

$DIR_PATH = "$HOME\.embulk"
if (Test-Path -Path $DIR_PATH -PathType Container) {
    Remove-Item -Path $DIR_PATH -Recurse
}
New-Item -ItemType Directory -Path $DIR_PATH

Write-Host "Installing embulk..."
Invoke-WebRequest -Uri "https://dl.embulk.org/embulk-$EMBULK_VERSION.jar" -OutFile $EMBULK_EXEC_PATH

Write-Host "Installing jruby..."
Invoke-WebRequest -Uri "https://repo1.maven.org/maven2/org/jruby/jruby-complete/9.3.11.0/jruby-complete-9.3.11.0.jar" -OutFile $JRUBY_EXEC_PATH

Add-Content -Path "$HOME\.embulk\embulk.properties" -Value ("jruby=file:///$JRUBY_EXEC_PATH")

Write-Host "Installing embulk plugins..."
java -jar $EMBULK_EXEC_PATH gem install embulk -v $EMBULK_VERSION
java -jar $EMBULK_EXEC_PATH gem install msgpack -v 1.4.1
java -jar $EMBULK_EXEC_PATH gem install embulk-input-postgresql
java -jar $EMBULK_EXEC_PATH gem install embulk-output-s3
java -jar $EMBULK_EXEC_PATH gem install liquid -v 4.0.0

Write-Host "Installing python packages..."
python -m pip install -v -r "$DECOMPRESSED_PATH\requirements.txt"
