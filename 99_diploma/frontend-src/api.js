import downloadjs from "downloadjs";
const PREFIX = "https://nodejs-notes-jd2k.vercel.app/";

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
        }),
  );
};

export const getNotes = async ({ age, search, page } = {}) => {
  const result = await req(
    "notes?" +
      new URLSearchParams({
        age,
        search,
        page,
      }).toString(),
  );

  return result;
};

export const createNote = async (title, text) => {
  const result = await req("notes", {
    method: "POST",
    body: {
      title,
      text,
    },
  });

  return result;
};

export const getNote = async (id) => {
  const result = await req(`notes/${id}`);

  return result;
};

export const archiveNote = async (id) => {
  const result = await req(`notes/${id}`, {
    method: "PUT",
  });

  return result;
};

export const unarchiveNote = async (id) => {
  const result = await req(`notes/${id}`, {
    method: "PUT",
  });

  return result;
};

export const editNote = async (id, title, text) => {
  const result = await req(`notes/${id}`, {
    method: "PATCH",
    body: {
      title,
      text,
    },
  });

  return result;
};

export const deleteNote = async (id) => {
  const result = await req(`notes/${id}`, {
    method: "DELETE",
  });

  return result;
};

export const deleteAllArchived = async () => {
  const result = await req(`notes`, {
    method: "DELETE",
  });

  return result;
};

export const notePdfUrl = async (id) => {
  fetch(PREFIX + `notes/${id}/pdf`, {
    responseType: "blob",
  })
    .then((res) => res.blob())
    .then((res) => {
      const pdfBlob = new Blob([res], { type: "application/pdf" });
      downloadjs(pdfBlob, "file.pdf", "text/pdf");
    });
};
