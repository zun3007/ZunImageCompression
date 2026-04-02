type MultipartField = {
  name: string;
  value: string;
};

type MultipartFile = {
  fieldName: string;
  filename: string;
  contentType: string;
  data: Buffer;
};

export const buildMultipartRequest = (input: {
  fields?: MultipartField[];
  files?: MultipartFile[];
}): { body: Buffer; headers: Record<string, string> } => {
  const boundary = `----zun-boundary-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const field of input.fields ?? []) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`
      )
    );
  }

  for (const file of input.files ?? []) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
      )
    );
    chunks.push(file.data);
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`
    }
  };
};
