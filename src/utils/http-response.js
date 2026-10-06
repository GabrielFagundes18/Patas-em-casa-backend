function successResponse(data, meta = {}) {
  return { data, meta };
}

function listResponse(items, total, page, pageSize) {
  return successResponse(items, {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}

function errorResponse(code, message, details = []) {
  return {
    error: {
      code,
      message,
      details,
    },
  };
}

module.exports = { successResponse, listResponse, errorResponse };