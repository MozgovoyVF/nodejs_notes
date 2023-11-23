const PREFIX = "???";

const req = (url, options = {}) => {
  const { body } = options;

  return fetch((PREFIX + url).replace(/\/\/$/, ""), {
    ...options,
    body: body ? JSON.stringify(body) : null,
    headers: {
      ...options.headers,
      ...(body
        ? {
            "Content-Type": "application/json",
          }
        : null),
    },
  }).then((res) =>
    res.ok
      ? res.json()
      : res.text().then((message) => {
          throw new Error(message);
        })
  );
};

export const getNotes = ({ age, search, page } = {}) => {};

export const createNote = (title, text) => {};

export const getNote = (id) => {};

export const archiveNote = {};

export const unarchiveNote = {};

export const editNote = (id, title, text) => {};

export const deleteNote = (id) => {};

export const deleteAllArchived = () => {};

export const notePdfUrl = (id) => {};
