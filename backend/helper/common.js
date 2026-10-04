const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.hashPassword = (password) => {
  if (!password) return null;
  password = bcrypt.hashSync(password, 12);
  return password;
};

exports.checkPassword = (password, hasedPassword) => {
  if (!password || !hasedPassword) return false;
  if (bcrypt.compareSync(password, hasedPassword)) return true;
  else return false;
};

exports.pagination = (records, offset, pageSize) => {
  // console.log("records", offset, pageSize);
  const page = offset / pageSize + 1;
  const endIndex = page * pageSize;
  const paginatedRecords = records?.slice(offset, endIndex);
  return paginatedRecords;
};