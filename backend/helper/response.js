exports.  sendSuccess = (res, message, data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    status: true,
    message,
    data,
  });
};

exports.sendError = (res, message, code = null, statusCode = 400, data= null) => {
  return res.status(statusCode).json({
    status: false,
    message,
    data,
    code, // Optional internal error code (e.g. USER_NOT_FOUND)
  });
};
