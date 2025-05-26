require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const bcrypt = require('bcryptjs');
const app = express();
const hbs = require('hbs');
require('./helpers')();
const User = require('./models/User');
const Chat = require('./models/Chat');
const Message = require('./models/Message');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {polling: true});
bot.setWebHook(`${process.env.APP_URL}/bot${process.env.TELEGRAM_TOKEN}`);
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGODB_URI);

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));


bot.onText(/\/link (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const appChatId = match[1];
  
  try {
    await Chat.findByIdAndUpdate(appChatId, { telegramChatId: chatId.toString() });
    bot.sendMessage(chatId, `Чат успешно привязан! ID: ${appChatId}`);
  } catch (error) {
    bot.sendMessage(chatId, 'Ошибка привязки чата');
  }
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chat = await Chat.findOne({ telegramChatId: msg.chat.id.toString() });
  if (!chat) return;

  const message = new Message({
    text: `[Telegram] ${msg.from.username}: ${msg.text}`,
    sender: chat.creator,
    chat: chat._id
  });

  await message.save();
  await Chat.findByIdAndUpdate(chat._id, { $push: { messages: message._id } });
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    store: MongoStore.create({ 
      mongoUrl: process.env.MONGODB_URI,
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
    }
  })
);


app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

app.get('/', (req, res) => res.redirect('/chats'));

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const hashedPassword = await bcrypt.hash(req.body.password, 12);
  const user = new User({
      _id: new mongoose.Types.ObjectId(),
      username: req.body.username,
      password: hashedPassword
    });
  await user.save();
  req.session.user = {
    id: user._id.toString(),
    username: user.username
  };
  res.redirect('/chats');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
    return res.render('login', { error: 'Invalid credentials' });
  }
  req.session.user = {
    id: user._id.toString(),
    username: user.username
  };
  console.log('User saved in session:', req.session.user);
  res.redirect('/chats');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/chats', requireAuth, async (req, res) => {
  const chats = await Chat.find({ participants: req.session.user.id });
  res.render('chats', { chats });
});

app.get('/search', requireAuth, async (req, res) => {
  const searchQuery = req.query.q;
  
  const chats = await Chat.find({
    name: { $regex: searchQuery, $options: 'i' }
  }).populate('participants', 'username');

  res.render('search', { 
    chats,
    searchQuery,
    user: req.session.user 
  });
});

app.post('/chats/:id/join', requireAuth, async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  const userId = new mongoose.Types.ObjectId(req.session.user.id);

  if (!chat.participants.includes(userId)) {
    chat.participants.push(userId);
    await chat.save();
  }

  res.redirect('/chats/' + chat._id);
});

app.post('/chats', requireAuth, async (req, res) => {
  const chat = new Chat({
    name: req.body.name,
    creator: req.session.user.id,
    participants: [req.session.user.id],
    messages: []
  });
  await chat.save();
  res.redirect('/chats/' + chat._id);
});

const { Types } = mongoose;
app.get('/chats/:id', requireAuth, async (req, res) => {
  const chatId = req.params.id;
  if (!Types.ObjectId.isValid(chatId)) return res.status(400).send('Invalid ID');

  const chat = await Chat.findById(chatId)
    .populate({ path: 'messages', populate: { path: 'sender', select: 'username' } })
    .populate('participants', 'username');

  if (!chat) return res.status(404).send('Chat not found');

  res.render('chat-room', {
    chat,
    messages: chat.messages,
    canSend: true
  });
});

app.post('/chats/:id/messages', requireAuth, async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat) return res.status(404).send('Chat not found');
  
  const senderId = new mongoose.Types.ObjectId(req.session.user.id);
  const message = new Message({
    text: req.body.text,
    sender: senderId,
    chat: chat._id
  });

  if (chat.telegramChatId) {
    bot.sendMessage(chat.telegramChatId, `${req.session.user.username}: ${req.body.text}`);
  }

  await message.save();
  chat.messages.push(message._id);
  await chat.save();

  res.redirect('/chats/' + chat._id);
});

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
