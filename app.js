const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "game.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000);
  } catch (e) {
    console.log(`DB ERROR: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const adminDetails = {
  adminPhoneNumber: 123456789,
  adminPassword: "admin",
};

const tokenAuthentication = (request, response, next) => {
  const authorization = request.headers["authorization"];
  let jwtToken;
  if (authorization !== undefined) jwtToken = authorization.split(" ")[1];

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "LOGIN_SECTION", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JwtToken");
      } else {
        request.userPhoneNumber = payload.phoneNumber;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JwtToken");
  }
};

const adminAuthorization = (request, response, next) => {
  const authorization = request.headers["authorization"];

  let jwtToken;
  if (authorization !== undefined) jwtToken = authorization.split(" ")[1];

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "ADMIN_SECTION", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JwtToken");
      } else {
        request.userPhoneNumber = payload.phoneNumber;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid Jwt Token");
  }
};

const playerDetails = (gameListArray) => {
  let array = gameListArray.map((eachGame) => {
    let player1 = [eachGame.u1_id, eachGame.score_u1, eachGame.win ? 1 : 0];
    let player2 = [eachGame.u2_id, eachGame.score_u2, eachGame.win ? 0 : 1];

    return [player1, player2];
  });
  return array;
};

const calculateTotalScoreOfEachPlayer = (eachPlayerDetailsArray) => {
  let playerDetails = {};
  for (let player of eachPlayerDetailsArray) {
    if (!(player[0] in playerDetails)) {
      playerDetails[player[0]] = {
        totalScore: player[1],
        win: player[2],
      };
    } else {
      let { totalScore, win } = playerDetails[player[0]];
      let playerUpdate = {
        totalScore: totalScore + player[1],
        win: win + player[2],
      };
      playerDetails[player[0]] = playerUpdate;
    }
  }
  return playerDetails;
};

const arrangePlayersScoreVise = (totalScoreOfEachPlayer) => {
  totalScoreOfEachPlayer["0"] = {
    totalScore: 0,
    win: 0,
  };
  let filterPlayer = totalScoreOfEachPlayer;
  let leaderBoard = {};
  count = 0;
  for (let i in totalScoreOfEachPlayer) {
    maxScore = 0;
    let maxScorePlayer = {};
    for (let player in filterPlayer) {
      const { totalScore } = filterPlayer[player];
      if (maxScore < totalScore) {
        maxScorePlayer = {
          id: player,
          ...filterPlayer[player],
        };
        maxScore = totalScore;
      }
    }
    leaderBoard[count] = maxScorePlayer;
    count++;
    delete filterPlayer[maxScorePlayer["id"]];
  }
  return leaderBoard;
};

const changeKeys = (user) => ({
  userName: user.name,
  userAge: user.age,
  userLocation: user.location,
  userEmailId: user.email_id,
  userPassword: user.password,
});

const dbFormatToResponseFormat = (game) => ({
  gameId: game.game_id,
  u1Id: game.u1_id,
  u2Id: game.u2_id,
  scoreU1: game.score_u1,
  scoreU2: game.score_u2,
  win: game.win,
});

app.post("/user/register/", async (request, response) => {
  const { name, password, age, location, emailId, phoneNumber } = request.body;

  const userQuery = `
        SELECT
            *
        FROM user
        WHERE 
        phone_number LIKE ${phoneNumber};`;

  const userDetails = await db.get(userQuery);

  if (userDetails === undefined) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUserQuery = `
            INSERT INTO user
                (name, age, location, email_id, phone_number, password)
            VALUES (
                '${name}',
                ${age},
                '${location}',
                '${emailId}',
                ${phoneNumber},
                '${hashedPassword}'
            );`;

    await db.run(newUserQuery);
    response.send("User created successfully");
  } else {
    response.status(400);
    response.send("User is already exists");
  }
});

app.post("/user/login/", async (request, response) => {
  const { phoneNumber, password } = request.body;

  const existingUserQuery = `
        SELECT 
            *
        FROM 
            user
        WHERE 
            phone_number LIKE ${phoneNumber};`;
  const existUser = await db.get(existingUserQuery);
  if (existUser !== undefined) {
    const isPasswordValid = await bcrypt.compare(password, existUser.password);
    if (isPasswordValid) {
      const payload = {
        phoneNumber: phoneNumber,
      };
      const jwtToken = jwt.sign(payload, "LOGIN_SECTION");

      response.send({
        jwtToken,
      });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const convertOutputFormat = (leaderBoard) => {
  let result = [];
  for (let player in leaderBoard) {
    let { id, totalScore, win } = leaderBoard[player];
    let eachPlayer = {
      userId: id,
      rank: parseInt(player) + 1,
      totalPoints: totalScore,
      win: win,
    };
    result.push(eachPlayer);
  }
  return result;
};

app.put("/user/update/", tokenAuthentication, async (request, response) => {
  const { name, age, location, emailId, password, phoneNumber } = request.body;
  const { userPhoneNumber } = request;

  if (phoneNumber === undefined) {
    const getUserQuery = `
            SELECT * FROM user WHERE phone_number LIKE ${userPhoneNumber};`;

    const userDetails = await db.get(getUserQuery);
    const userDetailsWithModifiedKeys = changeKeys(userDetails);
    let {
      userName,
      userAge,
      userLocation,
      userEmailId,
      userPassword,
    } = userDetailsWithModifiedKeys;

    if (name !== undefined) userName = name;
    if (age !== undefined) userAge = age;
    if (location !== undefined) userLocation = location;
    if (emailId !== undefined) userEmailId = emailId;
    if (password !== undefined) {
      const hashedPassword = await bcrypt.hash(password, 10);
      userPassword = hashedPassword;
    }
    const updateUserQuery = `
            UPDATE user
            SET
                name = '${userName}',
                age = ${userAge},
                location = '${userLocation}',
                email_id = '${userEmailId}',
                password = '${userPassword}'
            WHERE 
                phone_number LIKE ${userPhoneNumber};`;
    await db.run(updateUserQuery);
    response.send("User details updated successfully");
  } else {
    response.status(400);
    response.send("Phone number can't be change");
  }
});

app.get(
  "/games/list/:gameId/",
  tokenAuthentication,
  async (request, response) => {
    const { gameId } = request.params;
    const getGamesListQuery = `
        SELECT 
            *
        FROM 
            leaderboard
        WHERE 
            game_id LIKE ${gameId}`;

    const gamesList = await db.all(getGamesListQuery);
    let playerDetailsArray = playerDetails(gamesList);
    let eachPlayerDetailsArray = [];
    for (let match in playerDetailsArray) {
      const eachMatch = playerDetailsArray[match];
      for (let eachPlayer in eachMatch) {
        eachPlayerDetailsArray.push(playerDetailsArray[match][eachPlayer]);
      }
    }
    const totalScoreOfEachPlayer = calculateTotalScoreOfEachPlayer(
      eachPlayerDetailsArray
    );
    const leaderBoard = arrangePlayersScoreVise(totalScoreOfEachPlayer);
    const outputFormat = convertOutputFormat(leaderBoard);
    console.log(outputFormat);
  }
);

app.post("/user/result/", adminAuthorization, async (request, response) => {
  const { u1Id, u2Id, scoreU1, scoreU2, win, gameId } = request.body;
  const insertResultQuery = `
        INSERT INTO leaderboard
            (game_id, u1_id, u2_id, score_u1, score_u2, win)
        VALUES (
            ${gameId},
            ${u1Id},
            ${u2Id},
            ${scoreU1},
            ${scoreU2},
            '${win}'
        );`;
  await db.run(insertResultQuery);
  response.send("Result inserted successfully");
});

app.post("/admin/login/", (request, response) => {
  const { phoneNumber, password } = request.body;
  const { adminPhoneNumber, adminPassword } = adminDetails;

  if (adminPhoneNumber === phoneNumber && adminPassword === password) {
    const payload = {
      phoneNumber: phoneNumber,
    };
    const jwtToken = jwt.sign(payload, "ADMIN_SECTION");

    response.send({
      jwtToken,
    });
  } else {
    response.status(400);
    response.send("Invalid Admin Details");
  }
});

module.exports = app;
