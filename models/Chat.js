// 📁 models/Chat.js
const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  name: { type: String, required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  createdAt: { type: Date, default: Date.now },
  telegramChatId: { type: String, unique: true, sparse: true }
});
module.exports = mongoose.model('Chat', chatSchema);