const MENU_ID = "collect-brand-product-info";
const STOCK_CHECK_MENU_ID = "apply-stock-labels";
const SUPPORTED_ORIGINS = [
  "https://brand.naver.com",
  "https://smartstore.naver.com"
];
/*
TODO 상세 페이지용
제품상세페이지 https://smartstore.naver.com/gsc_korea_dt_bh/products/13035299663
window.__PRELOADED_STATE__.simpleProductForDetailPage.A

* */
function isSupportedPageUrl(pageUrl) {
  return SUPPORTED_ORIGINS.some((origin) => pageUrl.startsWith(`${origin}/`));
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "상품정보 모아보기",
    contexts: ["all"],
    documentUrlPatterns: ["https://brand.naver.com/*", "https://smartstore.naver.com/*"]
  });

  chrome.contextMenus.create({
    id: STOCK_CHECK_MENU_ID,
    title: "재고 확인하기",
    contexts: ["all"],
    documentUrlPatterns: ["https://brand.naver.com/*", "https://smartstore.naver.com/*"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) {
    return;
  }

  const pageUrl = tab.url || info.pageUrl || "";
  if (!isSupportedPageUrl(pageUrl)) {
    return;
  }

  if (info.menuItemId === STOCK_CHECK_MENU_ID) {
    await showProductTable(tab.id, {
      type: "RUN_STOCK_LABELS"
    });
    return;
  }

  if (info.menuItemId !== MENU_ID) {
    return;
  }

  try {
    const result = await extractRowsFromTab(tab.id);
    await showProductTable(tab.id, {
      type: "SHOW_PRODUCT_TABLE",
      payload: result
    });
  } catch (error) {
    await showProductTable(tab.id, {
      type: "SHOW_PRODUCT_TABLE",
      payload: {
        ok: false,
        message: error instanceof Error ? error.message : "상품 정보를 읽는 중 오류가 발생했습니다.",
        items: []
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "GET_PRODUCT_ROWS" || !sender.tab?.id) {
    return false;
  }

  extractRowsFromTab(sender.tab.id)
    .then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({
        ok: false,
        message: error instanceof Error ? error.message : "상품 정보를 읽는 중 오류가 발생했습니다.",
        items: []
      });
    });

  return true;
});

async function extractRowsFromTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: extractProductRows
  });

  return result;
}

async function showProductTable(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const maybeMessage = error instanceof Error ? error.message : String(error ?? "");
    if (!maybeMessage.includes("Receiving end does not exist")) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    await chrome.tabs.sendMessage(tabId, message);
  }
}

function extractProductRows() {
  const supportedOrigins = [
    "https://brand.naver.com",
    "https://smartstore.naver.com"
  ];

  function isSupportedPageUrl(currentPageUrl) {
    return supportedOrigins.some((origin) => currentPageUrl.startsWith(`${origin}/`));
  }

  const pageUrl = window.location.href;
  if (!isSupportedPageUrl(pageUrl)) {
    return {
      ok: false,
      message: "스토어 페이지에서만 사용할 수 있습니다.",
      items: []
    };
  }

  function extractBaseStoreUrl(currentPageUrl) {
    try {
      const url = new URL(currentPageUrl);
      const [mallName] = url.pathname.split("/").filter(Boolean);
      if (!mallName) {
        return "";
      }

      return `${url.origin}/${mallName}`;
    } catch {
      return "";
    }
  }

  function buildProductUrl(baseStoreUrl, id) {
    if (!baseStoreUrl || !id) {
      return "";
    }

    return `${baseStoreUrl}/products/${id}`;
  }

  const state = window.__PRELOADED_STATE__;
  const simpleProductsFull = (()=> {
    const a = state?.categoryProducts?.simpleProducts;
    return Array.isArray(a) ? a : [];
  })();
  const simpleProductsSearched = (()=> {
    const a = state?.keywordSearch?.A?.simpleProducts;
    return Array.isArray(a) ? a : [];
  })();
  const simpleProducts = simpleProductsFull.length > 0 ? simpleProductsFull : simpleProductsSearched;
  const baseStoreUrl = extractBaseStoreUrl(window.location.href);

  if (!Array.isArray(simpleProducts) || simpleProducts.length === 0) {
    return {
      ok: false,
      message: "simpleProducts 데이터를 찾을 수 없습니다.",
      items: []
    };
  }

  const items = simpleProducts.map((row) => ({
    id: row?.id ?? "",
    name: row?.name ?? "",
    salePrice: row?.salePrice ?? "",
    stockQuantity: row?.stockQuantity ?? "",
    representativeImageUrl: row?.representativeImageUrl ?? "",
    productUrl: buildProductUrl(baseStoreUrl, row?.id)
  }));

  return {
    ok: true,
    message: "",
    items
  };
}
