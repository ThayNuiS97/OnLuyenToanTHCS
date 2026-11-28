import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const INDEX_FILE = path.join(ROOT_DIR, "index.html");

const START_MARKER = "/*__QUESTIONS_START__*/";
const END_MARKER = "/*__QUESTIONS_END__*/";

function collectJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(collectJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b, "vi"));
}

function normalizeQuestionList(rawData, filePath) {
  if (Array.isArray(rawData)) return rawData;
  if (rawData && typeof rawData === "object") {
    if (Array.isArray(rawData.questions)) return rawData.questions;
    const merged = [];
    for (const key of ["mcq", "flashcard", "list", "tf"]) {
      if (Array.isArray(rawData[key])) {
        merged.push(...rawData[key]);
      }
    }
    if (merged.length > 0) return merged;
  }
  throw new Error(`Tệp ${filePath} không có mảng câu hỏi hợp lệ.`);
}

function mergeQuestionsById(questions) {
  const map = new Map();
  const order = [];
  questions.forEach((q, idx) => {
    if (!q || typeof q !== "object") return;
    const id = q.id ? String(q.id).trim() : `auto_q_${idx + 1}`;
    const item = { ...q, id };
    if (!map.has(id)) {
      order.push(id);
    }
    map.set(id, item);
  });
  return order.map((id) => map.get(id));
}

function main() {
  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error("Không tìm thấy tệp index.html ở thư mục gốc.");
  }

  const jsonFiles = collectJsonFiles(DATA_DIR);
  if (jsonFiles.length === 0) {
    console.log("Chưa có tệp JSON nào trong thư mục data/. Bỏ qua cập nhật.");
    return;
  }

  let allQuestions = [];
  for (const file of jsonFiles) {
    const content = fs.readFileSync(file, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error(`Lỗi cú pháp JSON ở tệp "${path.relative(ROOT_DIR, file)}": ${err.message}`);
    }
    const items = normalizeQuestionList(parsed, path.relative(ROOT_DIR, file));
    allQuestions = allQuestions.concat(items);
  }

  const mergedQuestions = mergeQuestionsById(allQuestions);
  const html = fs.readFileSync(INDEX_FILE, "utf8");

  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      `Không tìm thấy cặp thẻ đánh dấu ${START_MARKER} và ${END_MARKER} trong index.html.`
    );
  }

  const replacementBlock = `${START_MARKER}\nconst DEFAULT_QUESTIONS = ${JSON.stringify(mergedQuestions, null, 2)};\n${END_MARKER}`;
  const updatedHtml =
    html.slice(0, startIdx) + replacementBlock + html.slice(endIdx + END_MARKER.length);

  fs.writeFileSync(INDEX_FILE, updatedHtml, "utf8");
  console.log(
    `Đã gộp thành công ${mergedQuestions.length} câu hỏi từ ${jsonFiles.length} tệp JSON vào index.html.`
  );
}

main();
