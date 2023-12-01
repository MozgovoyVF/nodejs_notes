require("dotenv").config();
const express = require("express");
const fs = require("fs/promises");
const nunjucks = require("nunjucks");
const crypto = require("crypto");
const { nanoid } = require("nanoid");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const dayjs = require("dayjs");
const { attachPaginate } = require("knex-paginate");
const markdown = require("markdown").markdown;
const pdf = require('html-pdf')
attachPaginate();

const app = express();
const port = process.env.port || 3000;

nunjucks.configure(__dirname + "/views", {
  autoescape: true,
  express: app,
  cache: false,
  watch: true,
});

app.engine("njk", nunjucks.render);

const knex = require("knex")({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_POST || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
});

app.use(express.json());
app.use(express.static(__dirname + "/public"));
app.use(cookieParser());

const auth = () => async (req, res, next) => {
  if (!req.cookies["sessionId"]) return next();

  const user = await findUserBySessionId(req.cookies["sessionId"]);

  req.user = user;
  req.sessionId = req.cookies["sessionId"];
  next();
};

const hash = (d) => crypto.createHash("sha256").update(d).digest("base64");

app.set("view engine", "njk");

const createUser = async (username, password) => {
  const [userId] = await knex("users")
    .insert({
      username,
      password: hash(password),
    })
    .returning("id");

  return userId;
};

const findUserByUsername = async (username) => {
  return knex("users")
    .select()
    .where({ username })
    .limit(1)
    .then((res) => res[0]);
};

const findUserBySessionId = async (sessionId) => {
  const session = await knex("sessions")
    .select("user_id")
    .where({ session_id: sessionId })
    .limit(1)
    .then((res) => res[0]);

  if (!session) {
    return;
  }

  return knex("users")
    .select()
    .where({ id: session.user_id })
    .limit(1)
    .then((res) => res[0]);
};

const createSession = async (userId) => {
  const sessionId = nanoid();

  await knex("sessions").insert({
    user_id: userId,
    session_id: sessionId,
  });

  return sessionId;
};

const deleteSession = async (sessionId) => {
  await knex("sessions").where({ session_id: sessionId }).delete();
};

const findNotes = async (userId, page, age) => {
  let archive = false;

  switch (age) {
    case "alltime":
      age = null;
      break;
    case "archive":
      age = null;
      archive = true;
      break;
    case "1month":
      age = dayjs().subtract(1, "month").format();
      break;
    case "3months":
      age = dayjs().subtract(3, "month").format();
      break;

    default:
      break;
  }

  const data = await knex("notes")
    .where({
      user_id: userId,
    })
    .modify(function (queryBuilder) {
      if (age) {
        queryBuilder.where("created_at", ">=", age);
      }
      if (archive) {
        queryBuilder.where("is_archived", archive);
      }
    })
    .paginate({
      perPage: 20,
      currentPage: page,
    });

  if (data.data.length !== 0) {
    data.data.forEach((note) => {
      note._id = note.id;
      note.created = note.created_at;
      note.isArchived = note.is_archived;
      note.html = markdown.toHTML(note.text);
    });
  }

  data.data.length === 20 ? (data.hasMore = true) : (data.hasMore = false);

  return data;
};

const findNote = async (userId, id) => {
  const data = await knex("notes")
    .select()
    .where({ id, user_id: userId })
    .limit(1)
    .then((res) => res[0]);

  data._id = data.id;
  data.created = data.created_at;
  data.isArchived = data.is_archived;
  data.html = markdown.toHTML(data.text);

  return data;
};

const createNote = async (userId, title, text) => {
  const [data] = await knex("notes")
    .insert({
      title,
      text,
      user_id: userId,
    })
    .returning("*");

  data._id = data.id;
  data.created = data.created_at;
  data.isArchived = data.is_archived;
  data.html = markdown.toHTML(data.text);

  return data;
};

const switchArchiveNote = async (userId, id) => {
  const [note] = await knex("notes")
    .where({ id, user_id: userId })
    .update({
      is_archived: knex.raw("NOT is_archived"),
    })
    .returning("*");

  note._id = note.id;
  note.created = note.created_at;
  note.isArchived = note.is_archived;
  note.html = markdown.toHTML(note.text);

  return note;
};

const updateNote = async (userId, id, title, text) => {
  const [note] = await knex("notes")
    .where({ id, user_id: userId })
    .update({
      title,
      text,
    })
    .returning("*");

  note._id = note.id;
  note.created = note.created_at;
  note.isArchived = note.is_archived;
  note.html = markdown.toHTML(note.text);

  return note;
};

const deleteNote = async (userId, id) => {
  const data = await knex("notes").where({ id, user_id: userId }).delete();

  return data;
};

const deleteAllArchivedNotes = async (userId) => {
  const data = await knex("notes").where({ is_archived: true, user_id: userId }).delete();

  return data;
};

app.get("/", auth(), (req, res) => {
  if (req.user) return res.redirect("/dashboard");

  res.render("index", {
    authError: req.query.authError === "true" ? "Wrong username or password" : req.query.authError,
  });
});

app.get("/dashboard", auth(), (req, res) => {
  if (!req.user) return res.redirect("/");

  res.render("dashboard", {
    user: req.user,
  });
});

app.post("/login", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(username);

  if (!user || !password || hash(password) !== user.password) return res.redirect("/?authError=true");

  const sessionId = await createSession(user.id);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/dashboard");
});

app.get("/logout", auth(), async (req, res) => {
  if (!req.user) return res.redirect("/");
  await deleteSession(req.sessionId);
  res.clearCookie("sessionId").redirect("/");
});

app.post("/signup", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.redirect("/?authError=true");

  let user = await findUserByUsername(username);

  if (user) return res.redirect("/?authError=true");

  const searchUser = await createUser(username, password);
  const sessionId = await createSession(searchUser.id);

  const demoTitle = "Demo";
  const demoText = `
  # Это H1

  ## Это H2 ##
  
  ### Это H3
  
  #### Это H4 ####
  
  ##### Это H5 #####
  
  ###### Это H6
  
  * __Тезис №1__

  Раскрываем тезис.

  * __Тезис №2__

    Раскрываем тезис.

  ---

  * __Тезис №1__ Раскрываем тезис.

  * __Тезис №2__ Раскрываем тезис.

  __Жирный__

  **Тоже жирный**

  *Курсив*

  _Тоже курсив_

  ~~Зачеркнутый~~

  - Пункт 1

  - Пункт 2

  - Пункт 3

  или

  + Пункт 1

  + Пункт 2

  + Пункт 3

  или

  * Пункт 1

  * Пункт 2

  * Пункт 3

  - Пункт 1

          - Подпункт A

                  - Подподпункт a

  - Пункт 2

          + Подпункт A

                  * Подподпункт a

  ---

  1. Пункт 1

          + Подпункт A

                  - Подподпункт a

  2. Пункт 2

          1. Подпункт 2.1.

                  1. Подподпункт 2.1.1

  3. Пункт 3
`;
  await createNote(searchUser.id, demoTitle, demoText);

  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/dashboard");
});

app.get("/notes", auth(), async (req, res) => {
  const userId = req.user.id;
  const page = req.query.page;
  let age = req.query.age;

  if (!userId) return res.status(401).send("Пользователь не авторизован");

  try {
    const result = await findNotes(userId, page, age);
    return res.json(result);
  } catch (error) {
    return res.status(404).send("Неверный запрос к серверу");
  }
});

app.post("/notes", auth(), async (req, res) => {
  const { title, text } = req.body;
  const userId = req.user.id;

  if (!userId) return res.status(401).send("Пользователь не авторизован");

  try {
    const note = await createNote(userId, title, text);
    return res.json(note);
  } catch (error) {
    return res.status(404).send("Неверный запрос к серверу");
  }
});

app.delete("/notes", auth(), async (req, res) => {
  const userId = req.user.id;

  if (!userId) return res.status(401).send("Пользователь не авторизован");

  try {
    const notes = await deleteAllArchivedNotes(userId);
    return res.json(notes);
  } catch (error) {
    return res.status(404).send("Неверный запрос к серверу");
  }
});

app.get("/notes/:id", auth(), async (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;

  if (!userId) return res.status(401).send("Пользователь не авторизован");

  try {
    const note = await findNote(userId, id);
    note.html = markdown.toHTML(note.text);
    return res.json(note);
  } catch (error) {
    return res.status(404).send("Неверный запрос к серверу");
  }
});

app.put("/notes/:id", auth(), async (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;

  if (!userId) return res.status(401).send("Пользователь не авторизован");

  try {
    const note = await switchArchiveNote(userId, id);

    return res.json(note);
  } catch (error) {
    return res.status(404).send("Неверный запрос к серверу");
  }
});

app.patch("/notes/:id", auth(), async (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;
  const { title, text } = req.body;

  if (!userId) return res.status(401).send("Пользователь не авторизован");

  try {
    const note = await updateNote(userId, id, title, text);

    return res.json(note);
  } catch (error) {
    return res.status(404).send("Неверный запрос к серверу");
  }
});

app.delete("/notes/:id", auth(), async (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;

  if (!userId) return res.status(401).send("Пользователь не авторизован");

  try {
    const note = await deleteNote(userId, id);

    return res.json(note);
  } catch (error) {
    return res.status(404).send("Неверный запрос к серверу");
  }
});

app.get("/notes/:id/pdf", auth(), async (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;

  if (!userId) return res.status(401).send("Пользователь не авторизован");

  try {
    const note = await findNote(userId, id);
    note.html = markdown.toHTML(note.text);

    pdf.create(note.html).toBuffer(function(err, buffer){
      if (err) res.status(404).send('Ошибка сервера')
      console.log(buffer)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Length', buffer.length)
      res.setHeader('Content-Disposition', 'attachment; filename=name.Pdf')
      return res.send(buffer)
      // fs.writeFile(__dirname + "/public/file.pdf", buffer, "binary").then(() => {
      //   return res.sendFile(__dirname + "/public/file.pdf");
      // });
    });
  } catch (error) {
    return res.status(404).send("Неверный запрос к серверу");
  }
});

app.listen(port, () => {
  console.log(`Listening http://localhost:${port}`);
});
