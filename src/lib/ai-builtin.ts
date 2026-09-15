import { deaccent } from "@/lib/utils";

/**
 * The built-in assistant: an answer engine that needs no API key and no network.
 *
 * The owner could not get a key for any of the paid providers, and the thing the
 * assistant is actually wanted for is narrow — help making maps, explaining what
 * a control does, and questions about the app. That does not need a general
 * language model; it needs the product's own answers, retrieved. So this matches
 * a question against a small curated knowledge base and returns the entry that
 * fits. It is free forever, works offline, and — because every answer is written
 * here rather than generated — it cannot invent a control that does not exist,
 * which is the one failure the whole grounding effort exists to prevent.
 *
 * Bilingual, because the owner asks in Vietnamese and the interface is English.
 * The answer is returned in the language the question was asked in; the match is
 * accent-insensitive, so a question typed without Vietnamese diacritics still
 * finds its entry.
 */

export type Lang = "vi" | "en";

type Entry = {
  id: string;
  /** Trigger phrases, English and Vietnamese, matched as accent-folded substrings. */
  keywords: string[];
  answer: Record<Lang, string>;
};

/** Vietnamese-only letters, the cheapest reliable signal that a question is Vietnamese. */
const VI_LETTERS =
  /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

/** Romanised Vietnamese words people type with no diacritics; deliberately none that collide with common English. */
const VI_WORDS =
  /\b(lam sao|the nao|cach|tao|xoa|sua|cua|muon|minh|ban do|chuc nang|giai thich|o dau|khong|duoc|mau sac|phong to|thu nho|di chuyen|them|nhap|luu)\b/;

export function detectLang(question: string): Lang {
  if (VI_LETTERS.test(question)) return "vi";
  return VI_WORDS.test(deaccent(question).toLowerCase()) ? "vi" : "en";
}

const ENTRIES: Entry[] = [
  {
    id: "help",
    keywords: ["giup gi", "lam duoc gi", "ban la ai", "minh la ai", "help", "what can you do", "who are you", "tro giup", "huong dan", "bat dau"],
    answer: {
      vi: "Mình là trợ lý tích hợp sẵn của Kanovra — **miễn phí, không cần API key**. Mình giúp: tạo và chỉnh sửa **map** (sơ đồ tư duy), giải thích các **chức năng** trong web (project, task, board, chia sẻ, xuất file, lịch, phân quyền…) và trả lời câu hỏi liên quan tới app. Thử hỏi: “tạo map thế nào”, “đổi màu node”, “chia sẻ board”.",
      en: "I'm Kanovra's built-in assistant — **free, no API key needed**. I help you create and edit **maps**, explain the app's **features** (projects, tasks, boards, sharing, export, calendar, roles…), and answer questions about the app. Try: “how do I create a map”, “change a node colour”, “share a board”.",
    },
  },
  {
    id: "map-create",
    keywords: ["tao map", "tao ban do", "tao so do", "create map", "create a map", "make a map", "new map", "map moi", "so do tu duy", "mind map", "lam map", "how to create a map"],
    answer: {
      vi: "Ở thanh bên trái vào **Maps**. Trên trang đó bấm **New map** (góc trên bên phải), chọn **loại map**, đặt tên — map sẽ mở ra. Lưu ý: loại map chọn lúc tạo và **không đổi được** về sau.",
      en: "In the left sidebar open **Maps**. Press **New map** (top right), pick a **kind**, give it a title — it opens. Note: the kind is chosen at creation and **can't be changed** afterwards.",
    },
  },
  {
    id: "map-types",
    keywords: ["loai map", "cac loai map", "map types", "kind of map", "circle map", "bubble map", "tree map", "brace map", "multi-flow", "khac nhau"],
    answer: {
      vi: "Có 5 loại: **Circle** (bánh xe/sunburst — chia một chủ đề thành các phần theo tỉ lệ), **Bubble** (một chủ đề ở giữa, các tính chất bao quanh), **Tree** (cây phân cấp trên→dưới), **Brace** (tổng thể → bộ phận, dấu ngoặc), **Multi-flow** (nguyên nhân bên trái, kết quả bên phải). Circle/Bubble/Multi-flow/Tree kéo node được; Brace tự sắp xếp.",
      en: "Five kinds: **Circle** (a wheel/sunburst splitting a topic into weighted parts), **Bubble** (a centre with qualities around it), **Tree** (top-down hierarchy), **Brace** (whole → parts, a bracket), **Multi-flow** (causes left, effects right). Circle/Bubble/Multi-flow/Tree can be dragged; Brace lays itself out.",
    },
  },
  {
    id: "map-add",
    keywords: ["them node", "them muc", "them o", "add node", "add a node", "new node", "them nhanh", "add branch", "them con", "them nhanh con"],
    answer: {
      vi: "Bấm vào một node để chọn, rồi bấm nút **+** ở góc trên phải của node để thêm một node con nối vào nó. Gõ chữ trực tiếp vào ô. Ở map **Circle**, mở menu **…** của nhánh → “Add a branch beside/outward”.",
      en: "Click a node to select it, then press the **+** at its top-right corner to add a connected child. Type straight into the box. On a **Circle** map use the branch's **…** menu → “Add a branch beside/outward”.",
    },
  },
  {
    id: "map-resize",
    keywords: ["phong to node", "thu nho node", "resize node", "to hon", "nho hon", "doi kich thuoc", "kich thuoc node", "bigger", "smaller", "phong to muc", "thu nho muc"],
    answer: {
      vi: "Rê chuột vào node để hiện **tay cầm tròn ở góc** node, rồi **kéo ra để to lên, kéo vào để nhỏ lại**. Node có mức nhỏ nhất (~30%). Trên bàn phím: chọn node rồi bấm **+ / −**.",
      en: "Hover a node to reveal the **round handle at its corner**, then **drag it out to enlarge, in to shrink**. There's a minimum size (~30%). On the keyboard: select the node and press **+ / −**.",
    },
  },
  {
    id: "map-move",
    keywords: ["di chuyen node", "keo node", "move node", "drag node", "keo muc", "di chuyen muc", "put back", "keo tree"],
    answer: {
      vi: "Bấm vào **thân node và kéo** để di chuyển (bấm nhẹ không kéo thì vào gõ chữ). Map **Tree** cũng kéo được — kéo một node thì cả nhánh con đi theo; muốn trả về chỗ cũ dùng menu **…** → “Put back in the layout”. **Brace** thì cố định.",
      en: "Press the **node body and drag** to move it (a plain click just puts the cursor in the text). **Tree** maps drag too — moving a node carries its branch; reset it with the **…** menu → “Put back in the layout”. **Brace** stays fixed.",
    },
  },
  {
    id: "map-delete-node",
    keywords: ["xoa node", "xoa muc", "xoa nhanh", "delete node", "remove node", "xoa o", "delete branch", "bo node"],
    answer: {
      vi: "Chọn node rồi bấm phím **Delete** — nó xoá node đó **và cả nhánh con** bên dưới. Hoặc menu **…** → Remove. Lỡ tay thì **Ctrl+Z** để hoàn tác.",
      en: "Select the node and press **Delete** — it removes the node **and its whole branch**. Or the **…** menu → Remove. Undo with **Ctrl+Z**.",
    },
  },
  {
    id: "map-circle",
    keywords: ["banh xe", "wheel", "hub", "xoay", "rotate", "tam map", "sunburst", "vong tron", "quay map", "spin"],
    answer: {
      vi: "Map **Circle** là một bánh xe: **hub ở giữa** là tiêu đề. Kéo **chấm ở vành hub** để xoay. Thêm nhánh bằng menu **…** của nhánh. Thêm bánh xe khác bằng nút **Wheel** (góc trên phải). Xoá cả một bánh xe: bấm vào hub rồi **Delete** (luôn giữ lại ít nhất 1).",
      en: "A **Circle** map is a wheel: the **hub in the middle** is the title. Drag the **dot on the hub rim** to rotate. Add branches from a branch's **…** menu. Add another wheel with the **Wheel** button (top right). Delete a whole wheel: click its hub and press **Delete** (at least one always remains).",
    },
  },
  {
    id: "map-add-parent",
    keywords: ["them muc me", "main item", "them wheel", "them goc", "add root", "another wheel", "muc me moi", "muc me rieng", "parent moi"],
    answer: {
      vi: "Bấm nút **Main item** (hoặc **Wheel** với map Circle) ở **góc trên bên phải** để thêm một mục mẹ/gốc mới, độc lập. Áp dụng cho mọi loại map.",
      en: "Use the **Main item** button (or **Wheel** on a Circle map) at the **top right** to add a new independent root. Works on every map kind.",
    },
  },
  {
    id: "map-color",
    keywords: ["doi mau", "mau node", "color node", "colour", "change color", "to mau", "mau sac node", "more colours", "bang mau", "gradient"],
    answer: {
      vi: "Chọn node → menu **…** → **Change colour** mở bảng màu bên cạnh. Có các ô màu sẵn; bấm **More colours** để mở bảng màu phổ (kéo chọn) hoặc gõ mã **hex**. Trộn tối đa 4 màu thành gradient.",
      en: "Select a node → **…** menu → **Change colour** opens the colour panel. Pick a swatch, or press **More colours** for the full spectrum picker / a **hex** box. Blend up to four colours into a gradient.",
    },
  },
  {
    id: "map-text",
    keywords: ["dinh dang chu", "font chu", "in dam", "chu nghieng", "gach chan", "co chu", "bold", "italic", "underline", "text style", "kieu chu"],
    answer: {
      vi: "Chọn node → menu **…** → mục **Text**: in đậm (B), nghiêng (I), gạch chân (U), chỉnh **cỡ chữ** và chọn **font**. Áp dụng cho cả node hộp lẫn nhánh Circle.",
      en: "Select a node → **…** menu → **Text**: bold (B), italic (I), underline (U), **size**, and a **font**. Works on box nodes and Circle branches.",
    },
  },
  {
    id: "map-emoji",
    keywords: ["emoji", "bieu tuong", "icon node", "them emoji", "mat cuoi", "sticker"],
    answer: {
      vi: "Chọn node → menu **…** → **Emoji** (một ô, bấm để mở lưới emoji rồi chọn). Chọn lại emoji đang có để bỏ nó.",
      en: "Select a node → **…** menu → **Emoji** (one button that opens the emoji grid). Pick the current one again to clear it.",
    },
  },
  {
    id: "map-delete-map",
    keywords: ["xoa map", "xoa ban do", "delete map", "clear map", "xoa het map", "xoa toan bo map", "remove map", "xoa so do"],
    answer: {
      vi: "Ở trang **Maps**, mỗi map có nút **thùng rác** (hiện khi rê chuột) để xoá riêng; nút **Clear** xoá **toàn bộ** map của workspace. Cả hai đều hỏi xác nhận. (Cần quyền xoá — Admin.)",
      en: "On the **Maps** page each map has a **trash** button (on hover) to delete it; the **Clear** button deletes **every** map in the workspace. Both ask to confirm. (Needs delete permission — Admin.)",
    },
  },
  {
    id: "map-save",
    keywords: ["luu map", "save map", "tu luu", "autosave", "hoan tac", "undo", "khong co nut luu", "redo"],
    answer: {
      vi: "Map **tự lưu** khoảng một giây sau khi bạn ngừng — **không có nút Save**. Hoàn tác **Ctrl+Z**, làm lại **Ctrl+Shift+Z**. Nếu hai người sửa cùng lúc, lần lưu sau bị chặn kèm thông báo để chọn cách xử lý.",
      en: "Maps **autosave** about a second after you stop — **no Save button**. Undo **Ctrl+Z**, redo **Ctrl+Shift+Z**. If two people edit at once, the later save is held with a banner offering both ways out.",
    },
  },
  {
    id: "map-pan",
    keywords: ["di chuyen khung", "pan map", "zoom map", "phong to man hinh", "cuon", "keo nen", "background map", "keo man hinh"],
    answer: {
      vi: "**Kéo nền** (chỗ trống, không phải node) để di chuyển khung nhìn. **Lăn chuột** để phóng to/thu nhỏ cả bản đồ. Nút phần trăm ở góc đưa về giữa, 100%.",
      en: "**Drag the background** (empty space, not a node) to pan. **Scroll** to zoom the whole map. The percent button returns to centre at 100%.",
    },
  },
  {
    id: "project-create",
    keywords: ["tao project", "tao du an", "new project", "create project", "du an moi", "them project", "lap project"],
    answer: {
      vi: "Vào **Projects** ở thanh bên → nút **New project**. Đặt tên, màu, icon, trạng thái và ngày. (Cần quyền Member trở lên.)",
      en: "Open **Projects** in the sidebar → **New project**. Set a name, colour, icon, status and dates. (Member or above.)",
    },
  },
  {
    id: "task-create",
    keywords: ["tao task", "tao cong viec", "them task", "add task", "new task", "cong viec moi", "them the", "them viec"],
    answer: {
      vi: "Mở một project → tab **Board**. Mỗi cột có menu **⋯** → **Add task** để thêm việc vào cột đó. Kéo thẻ giữa các cột để đổi trạng thái.",
      en: "Open a project → **Board** tab. Each column's **⋯** menu has **Add task**. Drag cards between columns to change status.",
    },
  },
  {
    id: "share",
    keywords: ["chia se", "share board", "share a board", "public link", "link cong khai", "cong khai", "chia se board", "share project", "make it public"],
    answer: {
      vi: "Trong một project, mở menu **⋯** (góc trên phải) → **Share board** để tạo link công khai chỉ-đọc. Cần quyền **Admin**. Khi link đang bật, header hiện huy hiệu **Public**; xoá link là thu hồi quyền xem.",
      en: "In a project open the **⋯** menu (top right) → **Share board** for a read-only public link. Needs **Admin**. When live, the header shows a **Public** badge; deleting the link revokes access.",
    },
  },
  {
    id: "export",
    keywords: ["xuat file", "export", "csv", "tai ve", "download task", "xuat csv", "xuat task", "xuat excel"],
    answer: {
      vi: "Ở **My tasks** hoặc tab **List** của project, bấm **Export** để tải danh sách ra **CSV** (mở bằng Excel). File theo đúng bộ lọc/sắp xếp đang xem và có kèm subtask.",
      en: "On **My tasks** or a project's **List** tab, press **Export** to download the list as **CSV** (opens in Excel). It matches your current filter/sort and includes subtasks.",
    },
  },
  {
    id: "roles",
    keywords: ["quyen", "vai tro", "role", "permission", "viewer", "member", "admin", "owner", "phan quyen"],
    answer: {
      vi: "**Viewer** chỉ xem. **Member** làm việc hằng ngày (task, comment, project, map). **Admin** quản lý người, cài đặt, lưu trữ, xoá — và là quyền thấp nhất được chia sẻ board công khai. **Owner** làm tất cả, cộng xoá workspace/chuyển quyền sở hữu. Quyền luôn kiểm trên server.",
      en: "**Viewer** reads only. **Member** does day-to-day work (tasks, comments, projects, maps). **Admin** manages people, settings, archiving, deletion — and is the lowest role that can publish a board. **Owner** does everything plus deleting the workspace. Permission is always checked on the server.",
    },
  },
  {
    id: "calendar",
    keywords: ["lich", "calendar", "xem theo ngay", "due date", "han task", "chon ngay", "thang nam"],
    answer: {
      vi: "Có trang **Calendar** ở thanh bên (và tab Calendar trong mỗi project) hiển thị task theo hạn. Dùng nút chọn ngày (**Day/Month/Year**) hoặc mũi tên để nhảy tới tháng/ngày bất kỳ.",
      en: "There's a **Calendar** page in the sidebar (and a Calendar tab in each project) showing tasks by due date. Use the date picker (**Day/Month/Year**) or the arrows to jump to any month/day.",
    },
  },
  {
    id: "real-ai",
    keywords: ["gemini", "claude", "chatgpt", "openai", "api key", "model manh", "dung ai that", "tra phi", "con ai khac", "ai xin", "mo hinh khac"],
    answer: {
      vi: "Mình chạy nội bộ nên **miễn phí và không cần key**, nhưng chỉ trả lời quanh app. Muốn một mô hình mạnh hơn (viết nội dung, suy luận tự do), thêm API key vào `.env`: **Gemini** có bậc miễn phí tại aistudio.google.com/apikey (`GOOGLE_AI_API_KEY`), hoặc Claude/OpenAI (trả phí). Sau đó chọn model đó ở khung chọn phía trên.",
      en: "I run locally, so I'm **free and need no key**, but I only answer about the app. For a stronger model (free-form writing, reasoning), add an API key to `.env`: **Gemini** has a free tier at aistudio.google.com/apikey (`GOOGLE_AI_API_KEY`), or Claude/OpenAI (paid). Then pick that model in the picker above.",
    },
  },
];

const FALLBACK: Record<Lang, string> = {
  vi: "Mình chưa chắc câu này. Mình giúp tốt nhất về: tạo/sửa **map** (thêm, xoá, di chuyển, đổi màu, định dạng chữ, emoji node, map Circle, xoá map) và các **chức năng app** (project, task, board, chia sẻ, xuất CSV, lịch, phân quyền). Bạn thử hỏi cụ thể hơn xem?",
  en: "I'm not sure about that one. I help best with: creating/editing **maps** (add, delete, move, colour, text, emoji nodes, Circle maps, deleting maps) and **app features** (projects, tasks, boards, sharing, CSV export, calendar, roles). Try asking more specifically?",
};

/**
 * The entry that best fits a question, or null when nothing does.
 *
 * Scored by how many of an entry's trigger phrases the (accent-folded) question
 * contains, so a more specific question — more phrases matched — beats a vaguer
 * one, and ties fall to the earlier, more general entry.
 */
export function matchEntry(question: string): Entry | null {
  const flat = deaccent(question).toLowerCase();
  let best: Entry | null = null;
  let bestScore = 0;
  for (const entry of ENTRIES) {
    let score = 0;
    for (const keyword of entry.keywords) if (flat.includes(keyword)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore > 0 ? best : null;
}

/** The answer to a question, in the language it was asked in. */
export function builtinReply(question: string): string {
  const lang = detectLang(question);
  const entry = matchEntry(question);
  return entry ? entry.answer[lang] : FALLBACK[lang];
}

/**
 * A reply broken into small pieces, so the route can stream it the way a real
 * model's answer arrives — a word or two at a time rather than in one lump.
 */
export function builtinChunks(text: string): string[] {
  const tokens = text.split(/(\s+)/); // words and the whitespace between them
  const chunks: string[] = [];
  let buffer = "";
  for (const token of tokens) {
    buffer += token;
    // Flush on a whitespace boundary once the chunk is a few words long, so a
    // word is never split across two chunks.
    if (/\s$/.test(token) && buffer.length >= 14) {
      chunks.push(buffer);
      buffer = "";
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.length ? chunks : [text];
}
