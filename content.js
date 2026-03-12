const ROOT_ID = "__naver_brand_product_table_root__";
const STYLE_ID = "__naver_brand_product_table_style__";
const STOCK_BADGE_CLASS = "nbpt-stock-badge";
const CARD_MARKER_ATTR = "data-nbpt-stock-applied";
const SUPPORTED_ORIGINS = [
  "https://brand.naver.com",
  "https://smartstore.naver.com"
];

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SHOW_PRODUCT_TABLE") {
    renderProductTableModal(message.payload);
    return;
  }

  if (message?.type === "RUN_STOCK_LABELS") {
    initAutoStockLabels();
  }
});

window.setTimeout(() => {
  initAutoStockLabels();
}, 2000);

async function initAutoStockLabels() {
  if (!isSupportedPageUrl(location.href)) {
    return;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const payload = await requestProductRows();
    if (payload?.ok && Array.isArray(payload.items) && payload.items.length > 0) {
      const applied = applyStockLabels(payload.items);
      if (applied > 0) {
        return;
      }
    }

    await delay(1000);
  }
}

function renderProductTableModal(payload) {
  removeExistingModal();
  ensureStyles();

  const root = document.createElement("div");
  root.id = ROOT_ID;

  const backdrop = document.createElement("div");
  backdrop.className = "nbpt-backdrop";

  const modal = document.createElement("section");
  modal.className = "nbpt-modal";

  const header = document.createElement("div");
  header.className = "nbpt-header";

  const title = document.createElement("h2");
  title.className = "nbpt-title";
  title.textContent = "상품정보 모아보기";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "nbpt-close";
  closeButton.textContent = "닫기";

  header.append(title, closeButton);
  modal.append(header);

  if (!payload?.ok) {
    const empty = document.createElement("div");
    empty.className = "nbpt-empty";
    empty.textContent = payload?.message || "상품 정보를 찾을 수 없습니다.";
    modal.append(empty);
  } else {
    const summary = document.createElement("p");
    summary.className = "nbpt-summary";
    summary.textContent = `총 ${payload.items.length}개의 상품을 찾았습니다.`;

    const tableWrap = document.createElement("div");
    tableWrap.className = "nbpt-table-wrap";

    const table = document.createElement("table");
    table.className = "nbpt-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["썸네일", "상품명", "판매가", "재고"].forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.append(th);
    });
    thead.append(headerRow);

    const tbody = document.createElement("tbody");
    payload.items.forEach((item) => {
      const tr = document.createElement("tr");
      const isSoldOut = Number(item.stockQuantity) === 0;

      if (isSoldOut) {
        tr.className = "nbpt-row-sold-out";
      }

      appendThumbnailCell(tr, item);
      appendCell(tr, item.name);
      appendCell(tr, formatPrice(item.salePrice));
      appendStockCell(tr, item.stockQuantity);

      tbody.append(tr);
    });

    table.append(thead, tbody);
    tableWrap.append(table);
    modal.append(summary, tableWrap);
  }

  backdrop.addEventListener("click", removeExistingModal);
  closeButton.addEventListener("click", removeExistingModal);

  root.append(backdrop, modal);
  document.body.append(root);
}

function appendCell(row, value) {
  const td = document.createElement("td");
  td.textContent = value === "" || value == null ? "-" : String(value);
  row.append(td);
}

function appendStockCell(row, stockQuantity) {
  const td = document.createElement("td");

  if (Number(stockQuantity) === 0) {
    td.className = "nbpt-stock-sold-out";
    td.textContent = "품절";
  } else {
    td.textContent = stockQuantity === "" || stockQuantity == null ? "-" : String(stockQuantity);
  }

  row.append(td);
}

function appendThumbnailCell(row, item) {
  const td = document.createElement("td");
  td.className = "nbpt-thumbnail-cell";

  if (!item?.representativeImageUrl) {
    td.textContent = "-";
    row.append(td);
    return;
  }

  const image = document.createElement("img");
  image.className = "nbpt-thumbnail";
  image.src = item.representativeImageUrl;
  image.alt = item?.name || "상품 썸네일";
  image.loading = "lazy";

  if (item?.productUrl) {
    const link = document.createElement("a");
    link.href = item.productUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "nbpt-thumbnail-link";
    link.append(image);
    td.append(link);
  } else {
    td.append(image);
  }

  row.append(td);
}

function applyStockLabels(items) {
  ensureStyles();

  let appliedCount = 0;

  items.forEach((item) => {
    const card = document.querySelector(`div[data-shp-contents-id='${item.id}']`);
    if (!card || card.getAttribute(CARD_MARKER_ATTR) === "true") {
      return;
    }

    const priceSpan = findWonSpan(card);
    if (!priceSpan) {
      return;
    }

    const badge = document.createElement("span");
    badge.className = STOCK_BADGE_CLASS;
    badge.textContent = ` 재고:${item.stockQuantity ?? 0}개`;

    priceSpan.append(badge);
    card.setAttribute(CARD_MARKER_ATTR, "true");
    appliedCount += 1;
  });

  return appliedCount;
}

function findWonSpan(root) {
  const spans = root.querySelectorAll("span");
  for (const span of spans) {
    const text = span.textContent?.trim();
    if (text === "원" || text?.endsWith("원")) {
      return span;
    }
  }

  return null;
}

function requestProductRows() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PRODUCT_ROWS" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          message: chrome.runtime.lastError.message,
          items: []
        });
        return;
      }

      resolve(response);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isSupportedPageUrl(pageUrl) {
  return SUPPORTED_ORIGINS.some((origin) => pageUrl.startsWith(`${origin}/`));
}

function formatPrice(value) {
  if (typeof value === "number") {
    return `${value.toLocaleString("ko-KR")}원`;
  }

  const parsed = Number(value);
  if (!Number.isNaN(parsed) && value !== "") {
    return `${parsed.toLocaleString("ko-KR")}원`;
  }

  return value;
}

function removeExistingModal() {
  document.getElementById(ROOT_ID)?.remove();
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
    }

    #${ROOT_ID} .nbpt-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }

    #${ROOT_ID} .nbpt-modal {
      position: absolute;
      top: 50%;
      left: 50%;
      width: min(960px, calc(100vw - 32px));
      max-height: min(80vh, 900px);
      transform: translate(-50%, -50%);
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.25);
      overflow: hidden;
      color: #111827;
    }

    #${ROOT_ID} .nbpt-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(135deg, #03c75a, #16a34a);
      color: #ffffff;
    }

    #${ROOT_ID} .nbpt-title {
      margin: 0;
      font-size: 20px;
      line-height: 1.3;
    }

    #${ROOT_ID} .nbpt-close {
      border: 0;
      border-radius: 999px;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.18);
      color: #ffffff;
      cursor: pointer;
      font-size: 14px;
    }

    #${ROOT_ID} .nbpt-summary,
    #${ROOT_ID} .nbpt-empty {
      margin: 0;
      padding: 18px 24px;
      font-size: 14px;
    }

    #${ROOT_ID} .nbpt-empty {
      color: #b91c1c;
    }

    #${ROOT_ID} .nbpt-table-wrap {
      overflow: auto;
      max-height: calc(80vh - 120px);
      padding: 0 24px 32px;
    }

    #${ROOT_ID} .nbpt-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 14px;
    }

    #${ROOT_ID} .nbpt-table th,
    #${ROOT_ID} .nbpt-table td {
      border: 1px solid #e5e7eb;
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
      background: #ffffff;
    }

    #${ROOT_ID} .nbpt-row-sold-out td {
      background: #f3f4f6;
      color: #6b7280;
    }

    #${ROOT_ID} .nbpt-table th {
      position: sticky;
      top: 0;
      background: #f8fafc;
      z-index: 1;
    }

    #${ROOT_ID} .nbpt-stock-sold-out {
      color: #dc2626 !important;
      font-weight: 700;
    }

    #${ROOT_ID} .nbpt-table tbody tr:last-child td {
      border-bottom-width: 1px;
    }

    #${ROOT_ID} .nbpt-thumbnail-cell {
      width: 88px;
      text-align: center;
    }

    #${ROOT_ID} .nbpt-thumbnail-link {
      display: inline-flex;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
    }

    #${ROOT_ID} .nbpt-thumbnail {
      display: block;
      width: 64px;
      height: 64px;
      object-fit: cover;
      background: #f3f4f6;
    }

    .${STOCK_BADGE_CLASS} {
      margin-left: 6px;
      color: #0f766e;
      font-weight: 700;
      white-space: nowrap;
    }
  `;

  document.head.append(style);
}
