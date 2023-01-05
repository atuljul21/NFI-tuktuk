require('dotenv').config({ debug: false });
const express = require("express");
var bodyParser = require("body-parser");
var fs = require("fs");
const cron = require("node-cron");
request = require("request");
const fetch = require("node-fetch");
var path = require("path");
let Client = require("ssh2-sftp-client");
let sftp = new Client();
const app = express();
const axios = require("axios").default;
// let jsonPath = "/home/gateb-aprimo/sftp_transfer/aprimo/apps/titan/";
let jsonPath = "/aprimo/titan/";
const ftpConfig = JSON.parse(fs.readFileSync("ftp.json"));
const APR_CREDENTIALS = JSON.parse(fs.readFileSync("aprimo-credentials.json"));
app.use(express.json({ limit: "150mb" }));
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

getToken = async () => {
  const resultAssets = await fetch(APR_CREDENTIALS.API_URL, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "client-id": APR_CREDENTIALS.client_id,
      Authorization: `Basic ${APR_CREDENTIALS.Auth_Token}`,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      return data;
    })
    .catch((e) => {
      console.log("error in get token", e);
    });
  return resultAssets;
};

getJsonFile = async () => {
  var jsonData;
  let connectSMTP = await sftp.connect(ftpConfig)
    .then(async () => {
      return sftp.list(jsonPath);
    })
    .then(async (data) => {
      for (var i = 0, len = data.length; i < len; i++) {
        console.log(data[i].name);
        let ff = await sftp.get(jsonPath + data[i].name);
        jsonData = JSON.parse(ff.toString());
      }
    })
    .then(() => {
      sftp.end();
    })
    .catch((err) => {
      console.log(err, "catch error");
    });
  return jsonData;
};

searchField = async (AprToken, jsonData) => {
  //console.log(jsonData);
  for (var i = 0, len = jsonData.length; i < len; i++) {
    var masterDataID = jsonData[i].Creative;
    var daysRunStatus = jsonData[i]["Days Run Status"];
    console.log(masterDataID);
    if (masterDataID && daysRunStatus) {
      //console.log('both')
      let checkPlan = await axios
        .get(APR_CREDENTIALS.BaseURL+"/core/records?filter=fieldlabel('Aprimo Asset Name')=" +'"' +masterDataID +'"',
          {
            headers: {
              Accept: "*/*",
              "Content-Type": "application/json",
              "API-VERSION": APR_CREDENTIALS.Api_version,
              Authorization: `Bearer ${AprToken}`,
            },
          }
        )
        .then(async (resp) => {
          var resplanData = resp.data;
          console.log(resplanData);
          if (resplanData.items.length > 0) {
            console.log("for data update:::",resplanData.items[0].id,daysRunStatus);
            await updatePlan(AprToken, resplanData.items[0].id, daysRunStatus);
          }
        })
        .catch(async (error) => {
          console.log("001:: Record error", error.response.status);
        });
    } else {
      console.log("Field ID ", masterDataID, "Run Status", daysRunStatus);
    }
    
  }
};

updatePlan = async (AprToken, recordID, daysRunStatus) => {
  let body = {
    fields: {
      addOrUpdate: [
        {
          id: "996d5456b2b54a17ba31af6a010f71d5",
          localizedValues: [
            {
              value: daysRunStatus,
              languageId: "00000000000000000000000000000000",
              readOnly: null,
            },
          ],
        },
      ],
    },
  };

  let creatUpdateReq = await axios
    .put(APR_CREDENTIALS.BaseURL+"/core/record/"+recordID,
      body,
      {
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
          "API-VERSION": APR_CREDENTIALS.Api_version,
          Authorization: `Bearer ${AprToken}`,
        },
      }
    )
    .then(async (resp) => {
      console.log("001:: Updated Data", resp.data);
    })
    .catch(async (error) => {
      console.log("001:: Error in Update", error);
    });
};

main = async () => {
  var AprToken = await getToken();
  var getFile = await getJsonFile();
  console.log(getFile);
  await searchField(AprToken.accessToken, getFile);
} 

var task = cron.schedule("0 8 * * *", async () => {
  console.log("running a task every Day 8 AM");
  main();
});

task.start();

//main();

app.set("port", process.env.PORT || 3012);
app.listen(app.get("port"), function () {
  console.log("server started on port" + app.get("port"));
});
