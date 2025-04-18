const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 3000;

const allowCors = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Credentials, X-Access-Token, X-Key"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, PUT, POST, DELETE, OPTIONS, PATCH"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  next();
};

app.use(allowCors);
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname + "/dist/speech-recognition-poc"));

// SERVE ANGULAR index.html
app.get("*", (req, res) => {
  res.sendFile(__dirname + "/dist/speech-recognition-poc/index.html");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  console.log(`API Gateway running in port ${port}!`);
});
