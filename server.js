const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const io = require('@pm2/io');
const Sentry = require('@sentry/node');
const config = JSON.parse(fs.readFileSync('config.json'));

Sentry.init({ dsn: config.dsn });

const { middleware, pagination } = require('./middleware');
const { Database } = require('./structures/PostgreSQL');

const httpMeter = io.meter({
  name      : 'req/min',
  samples   : 1,
  timeframe : 60,
});

/****************
**   Config    **
****************/

// Start our database connection
Database.start();

// Set our API port
const APIPort = config.port;

// Create some global analytical variables
global.avgResponseTime = [];

// Create our express app
const app = express();

app.use(Sentry.Handlers.requestHandler());

app.use(function(req, res, next) {
  const startHrTime = process.hrtime();
  httpMeter.mark();

  res.on("finish", () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedTimeInMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6;

    if (req.path !== "/" && req.path !== "/api/info") {
      global.avgResponseTime.push(elapsedTimeInMs);
      if (global.avgResponseTime.length > 99) {
        global.avgResponseTime.shift();
      }
    }
  });

  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.set('secret', config.secret);

/****************
**  REST API   **
****************/

app.get("/", (req, res) => {
  res.status(200).send('API Online');
});

app.get("/api/info", (req, res) => {
  const arrAvg = arr => arr.reduce((a,b) => a + b, 0) / arr.length
  res.status(200).json({
    avgResponseTime: arrAvg(avgResponseTime),
  });
});

/* AUTHENTICATION REQUIRED */

/* Message Activity */
const { getMessages, getMessagesByChannel, getMessageCount, getNewMessagesCount } = require('./routes/messages');

app.get("/v1.0/messages", [middleware, pagination], getMessages);
app.get("/v1.0/messages/count", middleware, getMessageCount);
app.get("/v1.0/messages/new", middleware, getNewMessagesCount);
app.get("/v1.0/messages/:channelId", [middleware, pagination], getMessagesByChannel);

/* Discord Roles */
const { getRoles } = require('./routes/roles');

app.get("/v1.0/roles", [middleware, pagination], getRoles);

/* Global Voice Activity */
const { getVoice, getVoiceCount, getAverageVoiceTime, getChannelVoiceActivity } = require('./routes/voice');

app.get("/v1.0/voice", [middleware, pagination], getVoice);
app.get("/v1.0/voice/count", middleware, getVoiceCount);
app.get("/v1.0/voice/average", middleware, getAverageVoiceTime);
app.get("/v1.0/voice/:channelId", middleware, getChannelVoiceActivity);

/* Global Squad Activity */
const { getSquad, getSquadCount } = require('./routes/squad');

app.get("/v1.0/squad", [middleware, pagination], getSquad);
app.get("/v1.0/squad/count", middleware, getSquadCount);

/* Get Channels */
const { getChannels, getChannelById } = require('./routes/channels');

app.get("/v1.0/channels", [middleware, pagination], getChannels);
app.get("/v1.0/channels/:id", middleware, getChannelById);

/* Users */
const {
  getUser,
  getUsers,
  getUserVoice,
  getUserSquad,
  getUserMessages,
  getUserCount,
  getNewUsersCount,
  getUserVoiceDaily,
  getUserVoiceAverage,
  getUserMessagesByDay,
  getUserVoiceByChannel,
  updateUser,
} = require('./routes/user');

app.get("/v1.0/users", [middleware, pagination], getUsers);
app.get("/v1.0/users/count", middleware, getUserCount);
app.get("/v1.0/users/new", middleware, getNewUsersCount);
app.get("/v1.0/users/:id", middleware, getUser);
app.post("/v1.0/users/:id", middleware, updateUser);
app.get("/v1.0/users/:id/voice", [middleware, pagination], getUserVoice);
app.get("/v1.0/users/:id/voice/average", middleware, getUserVoiceAverage);
app.get("/v1.0/users/:id/voice/daily", middleware, getUserVoiceDaily);
app.get("/v1.0/users/:id/voice/channel/:channelId", [middleware, pagination], getUserVoiceByChannel);
app.get("/v1.0/users/:id/squad", [middleware, pagination], getUserSquad);
app.get("/v1.0/users/:id/messages", [middleware, pagination], getUserMessages);
app.get("/v1.0/users/:id/messages/daily", middleware, getUserMessagesByDay);

const { searchUsers } = require('./routes/search');
app.get("/v1.0/search/users", [middleware, pagination], searchUsers);

const { discordAuthRedirect, discordAuthVerify, discordSession, discordAuthLogin } = require('./routes/discord');
app.get("/v1.0/discord/redirect", discordAuthRedirect);
app.get("/v1.0/discord/verify", discordAuthVerify);
app.get("/v1.0/discord/session", discordSession);
app.post("/v1.0/discord/login", discordAuthLogin);

const {
  submitApplication,
  getApplications,
  getApplication,
  voteApplication,
  getUserApplications,
  updateApplication,
  giveTags,
  completeApplication,
  promoteApplicant,
  processVotingApplications,
} = require('./routes/applications');
app.post("/v1.0/application/submit", submitApplication);
app.get("/v1.0/applications/giveTags", middleware, giveTags);
app.get("/v1.0/applications/process", processVotingApplications);
app.get("/v1.0/application/promote", middleware, promoteApplicant);
app.get("/v1.0/applications", [middleware, pagination], getApplications);
app.get("/v1.0/applications/:id", [ middleware, pagination], getUserApplications);
app.get("/v1.0/application/:id", middleware, getApplication);
app.post("/v1.0/applications/:id/vote", middleware, voteApplication);
app.post("/v1.0/applications/:id", middleware, updateApplication);
app.post("/v1.0/applications/:id/complete", middleware, completeApplication);

const { getWhitelist } = require('./routes/whitelist');
app.get("/v1.0/whitelist", getWhitelist);

const { getSteamUsers, getSteamUserBans } = require('./routes/steam');
app.get("/v1.0/steam/getUsers", middleware, getSteamUsers);
app.get("/v1.0/steam/getUserBans", middleware, getSteamUserBans);

const { getUserEventLog } = require('./routes/eventlog');
app.get("/v1.0/eventlog/:id", middleware, getUserEventLog);

const { addStaffNote, getStaffNotes } = require('./routes/notes');
app.post("/v1.0/notes/:userId", middleware, addStaffNote);
app.get("/v1.0/notes/:userId", middleware, getStaffNotes);

// Sentry error handling

app.use(Sentry.Handlers.errorHandler());
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({ status, message, sentry: res.sentry });
});

// Start out server :)

app.listen(APIPort, () => {
  console.log(`Listening on PORT ${APIPort}`);
});
