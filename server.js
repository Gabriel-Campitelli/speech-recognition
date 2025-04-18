const express = require("express");
const path = require("path");
const app = express();

app.use(express.static(__dirname + "dist/speech-recognition-poc"));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist/speech-recognition-poc/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Gateway running in port ${port}!`);
});
