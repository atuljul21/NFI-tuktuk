require("dotenv").config({ debug: false });
const express = require("express");
var bodyParser = require("body-parser");
var fs = require("fs");
request = require("request");
const cron = require("node-cron");
const fetch = require("node-fetch");
var path = require("path");
let Client = require("ssh2-sftp-client");
let sftp = new Client();
const app = express();
const axios = require("axios").default;
//let folderPath = "/home/gateb-aprimo/sftp_transfer/aprimo/tuktuk/";
let folderPath = "/aprimo/tuktuk/";
let readJSONCron = true;
const APR_CREDENTIALS = JSON.parse(fs.readFileSync("aprimo-credentials.json"));
const ftpConfig = JSON.parse(fs.readFileSync("ftp.json"));
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
  let connectSMTP = await sftp
    .connect(ftpConfig)
    .then(async () => {
      return sftp.list(folderPath);
    })
    .then(async (data) => {
      for (var i = 0, len = data.length; i < len; i++) {
        console.log(data[i].name);
        let ff = await sftp.get(folderPath + data[i].name);
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

searchActivity = async (AprToken, getFile, getExtAttr) => {
  console.log(AprToken);
  console.log(getFile);
  for (var i = 0, len = getFile.length; i < len; i++) {
    var masterData = getFile[i];
    var body = {
      equals: {
        fieldName: "extrAttr101",
        fieldValue: masterData.ActivityID,
      },
    };
    let checkPlan = await axios
      .post(APR_CREDENTIALS.SeachURL, body, {
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
          "API-VERSION": APR_CREDENTIALS.Api_version,
          "X-Access-Token": `${AprToken}`,
        },
      })
      .then(async (resp) => {
        var resplanData = resp.data;
        console.log(resplanData);
        await updateActivity(AprToken, masterData, getExtAttr);
        if (resplanData._total !== 0) {
          const planID = resplanData._embedded["generic-object-alpha"][0].id;
          //await updateActivity(AprToken, masterData, getExtAttr);
          await updatePlan(AprToken, masterData, planID, getExtAttr);
          console.log("Update Plan:::0088");
        } else {
          console.log("Create Plan:::0088");
          await createPlan(AprToken, masterData);
        }
        
      })
      .catch(async (error) => {
        console.log("001:: Record error Search", error.response.status);
      });
  }
  //return reqCreatRequest;
};

updatePlan = async (AprToken, masterData, planID) => {
  var resplanData = await getPlan(AprToken, planID);
  console.log("Plan Data 0000999", resplanData);
  const mapobj = new Map([
    [101, "ActivityID"],
    [201, "ActivityName"],
    [202, "Asset Type"],
    [102, "BrandID"],
    [301, "BrandName"],
    [401, "Buy Type"],
    [302, "Category"],
    [303, "Channel"],
    [304, "DSP Platform"],
    [305, "FlightEnd"],
    [402, "FlightID"],
    [306, "FlightStart"],
    [403, "HeroProduct"],
    [404, "Market"],
    [405, "MediaOwnerLevel1"],
    [406, "MWB/C Cluster"],
    [307, "Pillar"],
    [501, "PlanCode"],
    [601, "PlanID"],
    [308, "Site / Partner Name"],
    [309, "VersionID"],
  ]);

  for (const mapping of mapobj) {
    const eaValue = masterData[mapping[1]];
    if (eaValue) {
      const extendedAttributes = resplanData.extendedAttributes.filter(
        (val) => val.eaId === mapping[0]
      );
      if (extendedAttributes.length > 0) {
        extendedAttributes[0].eaValue = eaValue;
      } else {
        resplanData.extendedAttributes.push({
          eaId: mapping[0],
          skipDCTSave: false,
          eaValue: eaValue,
          attributeName: "extrAttr" + mapping[0],
        });
      }
    }
  }

  let creatUpdateReq = await axios
    .put(APR_CREDENTIALS.AlphaObj + "/" + planID, resplanData, {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        "API-VERSION": APR_CREDENTIALS.Api_version,
        "X-Access-Token": `${AprToken}`,
      },
    })
    .then(async (resp) => {
      //console.log("001:: Updated Data", resp.data);
    })
    .catch(async (error) => {
      console.log("001:: Error in Update", error);
    });
};

getPlan = async (AprToken, planID) => {
  console.log(planID);
  let planData;
   let checkPlan = await axios
     .get(APR_CREDENTIALS.AlphaObj + "/" + planID, {
       headers: {
         Accept: "*/*",
         "Content-Type": "application/json",
         "API-VERSION": APR_CREDENTIALS.Api_version,
         "X-Access-Token": `${AprToken}`,
       },
     })
     .then(async (resp) => {
       //console.log("plan Data 000988",resp.data);
       planData = resp.data;
     })
     .catch(async (error) => {
       console.log("001:: Record error", error.response.status);
       //await createPlan(AprToken, masterData);
     });
  
  return planData;;
};

async function getAdditionalFiles(recordId, latestversionID, compFile, token, masterfileID){
  let latestversion = await axios
  .get(APR_CREDENTIALS.additionalfiles + latestversionID + "/additionalfiles",
    {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        "API-VERSION": APR_CREDENTIALS.Api_version,
        Authorization: `Bearer ${token}`,
      },
    }
  )
  .then(async (resp) => {
    let additionalfilesID = resp.data.items[0].id;
    if (additionalfilesID !== null) {
      console.log(new Date() + "||", "001:: additionalfilesID:", additionalfilesID);
      await updateAdditionalFiles(recordId, additionalfilesID, latestversionID, compFile, token, masterfileID);
    } else {
      console.log(new Date() + "||", "001:: API error for master file");
    }
  })
  .catch((error) => {
    console.log(new Date() + "||", "001:: error in getAdditionalFiles", error);
  });
}

createPlan = async (AprToken, masterData) => {
  //console.log(masterData);
  let body = {
    id: 0,
    name: masterData.ActivityName,
    relatedObjectId: masterData.AprimoID,
    status: 1,
    extendedAttributes: [
      {
        eaId: 101,
        skipDCTSave: false,
        eaValue: masterData.ActivityID,
        attributeName: "extrAttr101",
      },
      {
        eaId: 102,
        skipDCTSave: false,
        eaValue: masterData.BrandID,
        attributeName: "extrAttr102",
      },
      {
        eaId: 201,
        skipDCTSave: false,
        eaValue: masterData.ActivityName,
        attributeName: "extrAttr201",
      },
      {
        eaId: 202,
        skipDCTSave: false,
        eaValue: masterData.AssetType,
        attributeName: "extrAttr202",
      },
      {
        eaId: 301,
        skipDCTSave: false,
        eaValue: masterData.BrandName,
        attributeName: "extrAttr301",
      },
      {
        eaId: 302,
        skipDCTSave: false,
        eaValue: masterData.Category,
        attributeName: "extrAttr302",
      },
      {
        eaId: 303,
        skipDCTSave: false,
        eaValue: masterData.Channel,
        attributeName: "extrAttr303",
      },
      {
        eaId: 304,
        skipDCTSave: false,
        eaValue: masterData.DSPPlatform,
        attributeName: "extrAttr304",
      },
      {
        eaId: 305,
        skipDCTSave: false,
        eaValue: masterData.FlightEnd,
        attributeName: "extrAttr305",
      },
      {
        eaId: 306,
        skipDCTSave: false,
        eaValue: masterData.FlightStart,
        attributeName: "extrAttr306",
      },
      {
        eaId: 307,
        skipDCTSave: false,
        eaValue: masterData.Pillar,
        attributeName: "extrAttr307",
      },
      {
        eaId: 308,
        skipDCTSave: false,
        eaValue: masterData["Site/PartnerName"],
        attributeName: "extrAttr308",
      },
      {
        eaId: 309,
        skipDCTSave: false,
        eaValue: masterData.ActivityID,
        attributeName: "extrAttr309",
      },
      {
        eaId: 401,
        skipDCTSave: false,
        eaValue: masterData.BuyType,
        attributeName: "extrAttr401",
      },
      {
        eaId: 402,
        skipDCTSave: false,
        eaValue: masterData.FlightID,
        attributeName: "extrAttr402",
      },
      {
        eaId: 403,
        skipDCTSave: false,
        eaValue: masterData.HeroProduct,
        attributeName: "extrAttr403",
      },
      {
        eaId: 404,
        skipDCTSave: false,
        eaValue: masterData.Market,
        attributeName: "extrAttr404",
      },
      {
        eaId: 405,
        skipDCTSave: false,
        eaValue: masterData.MediaOwnerLevel1,
        attributeName: "extrAttr405",
      },
      {
        eaId: 406,
        skipDCTSave: false,
        eaValue: masterData["MWB/CCluster"],
        attributeName: "extrAttr406",
      },
      {
        eaId: 501,
        skipDCTSave: false,
        eaValue: masterData.PlanCode,
        attributeName: "extrAttr501",
      },
      {
        eaId: 601,
        skipDCTSave: false,
        eaValue: masterData.PlanID,
        attributeName: "extrAttr601",
      },
    ],
  };
  
  let createPlanReq = await axios
    .post(APR_CREDENTIALS.AlphaObj, body, {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        "API-VERSION": APR_CREDENTIALS.Api_version,
        "X-Access-Token": `${AprToken}`,
      },
    })
    .then(async (resp) => {
      console.log("Create Plan");
      //console.log("001:: Create Plan", resp.data);
    })
    .catch((error) => {
      console.log("001:: Record error Create Plan", error.response.status);
    });
};

updateActivity = async (AprToken, masterData, getExtAttr) => {
  let encodedVal = masterData["MWB/CCluster"];
  var myArray = getExtAttr.items;
  var matchId;
  for (var i = 0; i < myArray.length; i++) {
    if (myArray[i].displayValue === encodedVal) {
      matchId = myArray[i];
    }
  }

  console.log("MatchID", matchId.itemId);

  let body = {
    extendedAttributes: [
      {
        eaId: 305,
        skipDCTSave: false,
        eaValue: matchId.itemId,
        attributeName: "extrAttr305",
      },
    ],
  };
  let createActCrust = await axios
    .put(APR_CREDENTIALS.BaseURL + "activities/" + masterData.AprimoID, body, {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        "API-VERSION": APR_CREDENTIALS.Api_version,
        "X-Access-Token": `${AprToken}`,
      },
    })
    .then(async (resp) => {
      console.log("Update Activity MWB/CCluster", resp);
    })
    .catch(async (error) => {
      console.log("001:: Record error updateActivity", error.response.status);
      //await createPlan(AprToken, masterData);
    });
};

getExtendedAttr = async (AprToken) => {
  var getExtendedData;
  let getExtendedAttrReq = await axios
    .get(APR_CREDENTIALS.getExtendedList, {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        "API-VERSION": APR_CREDENTIALS.Api_version,
        "X-Access-Token": `${AprToken}`,
      },
    })
    .then(async (resp) => {
      getExtendedData = resp.data;
      console.log(getExtendedData);
    })
    .catch(async (error) => {
      console.log("001:: Record error getExtendedData", error.response.status);
    });
  return getExtendedData;
};

main = async () => {
  var AprToken = await getToken();
  var getFile = await getJsonFile();
  var getExtAttr = await getExtendedAttr(AprToken.accessToken);
  // console.log(getExtAttr);
  // console.log(getFile);
  await searchActivity(AprToken.accessToken, getFile, getExtAttr);
};

// var task = cron.schedule("0 8 * * *", async () => {
//   console.log("Running a task every Day 8 AM IST");
//   main();
// });

var task = cron.schedule("*/10 * * * *", async () => {
  console.log("running a task every 10 minuts");
  main();
});


 task.start();

main();

app.set("port", process.env.PORT || 3011);

app.listen(app.get("port"), function () {
  console.log("server started on port" + app.get("port"));
});
