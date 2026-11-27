const MODEL = "gemini-3.5-flash-lite";
const MAX_PLACES = 8;

function response(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "vary": "Origin"
    }
  });
}

async function searchRestaurant(env, place, menu) {
  const query = [place.name, place.address, menu, "맛 후기 재방문"].filter(Boolean).join(" ");
  const result = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY,
      query,
      topic: "general",
      search_depth: "basic",
      max_results: 4,
      include_answer: false,
      include_raw_content: false
    })
  });
  if (!result.ok) throw new Error("웹 검색 서비스에 연결하지 못했습니다.");
  const data = await result.json();
  return (data.results || []).map((item, index) => ({
    sourceId: `${place.id}-${index + 1}`,
    title: item.title || "",
    url: item.url || "",
    excerpt: String(item.content || "").slice(0, 1200),
    publishedDate: item.published_date || ""
  }));
}

async function evaluate(env, menu, evidence) {
  const prompt = `당신은 한국 식당을 '찐맛집' 기준으로 조사하는 평가자입니다. 웹 검색 발췌만 근거로 평가하고, 별점·검색순위·광고 문구만으로 높은 점수를 주지 마세요.\n\n평가 기준:\n- 검색 메뉴 자체의 맛과 조리 완성도(국물/불향/식감/재료 등 구체적 묘사)\n- 여러 독립적인 방문 후기에서 반복되는 긍정 또는 부정 내용\n- 재방문·단골 언급은 가산 근거\n- 협찬·체험단·홍보성 흔적이 강한 자료는 낮은 신뢰도로 취급\n- 자료가 부족하거나 상호가 불확실하면 score를 0으로 하고 '근거 부족'이라고 표시\n\n점수는 1.0~5.0의 찐맛집 근거 점수입니다. 4.5 이상은 서로 다른 후기에서 해당 메뉴의 구체적 장점과 반복 방문 근거가 확인될 때만 부여하세요. 각 식당마다 짧은 한국어 근거와 실제 제공된 sourceId만 반환하세요. 검색 결과의 요약문을 사실로 단정하지 말고, 추정이면 추정이라고 밝혀 주세요.\n\n검색 메뉴: ${menu}\n자료: ${JSON.stringify(evidence)}`;
  const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            results: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "STRING" },
                  score: { type: "NUMBER" },
                  reason: { type: "STRING" },
                  sourceIds: { type: "ARRAY", items: { type: "STRING" } }
                },
                required: ["id", "score", "reason", "sourceIds"]
              }
            }
          },
          required: ["results"]
        }
      }
    })
  });
  if (!result.ok) throw new Error("무료 평가 한도에 도달했거나 평가 서비스 오류가 발생했습니다.");
  const data = await result.json();
  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
  if (!text) throw new Error("평가 결과를 받지 못했습니다.");
  return JSON.parse(text).results || [];
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "https://flight00ff.github.io";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": allowed,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "vary": "Origin"
    }});
    if (origin && origin !== allowed) return response({ error: "허용되지 않은 사이트입니다." }, 403, allowed);
    if (request.method !== "POST") return response({ error: "POST 요청만 지원합니다." }, 405, allowed);
    if (!env.TAVILY_API_KEY || !env.GEMINI_API_KEY) return response({ error: "서버 API 키 설정이 필요합니다." }, 503, allowed);
    try {
      const body = await request.json();
      const menu = String(body.menu || "").slice(0, 80);
      const places = (Array.isArray(body.places) ? body.places : []).slice(0, MAX_PLACES).map(place => ({
        id: String(place.id || "").slice(0, 200),
        name: String(place.name || "").slice(0, 120),
        address: String(place.address || "").slice(0, 180),
        category: String(place.category || "").slice(0, 120)
      })).filter(place => place.id && place.name);
      if (!menu || !places.length) return response({ error: "검색 메뉴와 식당 정보가 필요합니다." }, 400, allowed);
      const evidence = await Promise.all(places.map(async place => ({
        id: place.id,
        name: place.name,
        address: place.address,
        category: place.category,
        sources: await searchRestaurant(env, place, menu)
      })));
      const scored = await evaluate(env, menu, evidence);
      const results = places.map(place => {
        const item = scored.find(result => result.id === place.id) || {};
        const validIds = new Set((evidence.find(row => row.id === place.id)?.sources || []).map(source => source.sourceId));
        const sources = (item.sourceIds || []).filter(id => validIds.has(id)).map(id => {
          const source = evidence.find(row => row.id === place.id).sources.find(row => row.sourceId === id);
          return { title: source.title, url: source.url };
        });
        const score = Number(item.score);
        return { id: place.id, score: score > 0 && score <= 5 ? Math.round(score * 10) / 10 : null, reason: String(item.reason || "근거 부족"), sources };
      });
      return response({ results }, 200, allowed);
    } catch (error) {
      return response({ error: error.message || "평가 중 오류가 발생했습니다." }, 502, allowed);
    }
  }
};
