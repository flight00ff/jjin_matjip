# 무료 검색 평가 설정

사이트의 검색 버튼은 Kakao 장소 검색 후 식당을 웹에서 찾아 평가합니다. 평가 기준은 검색 메뉴 자체의 맛, 구체적인 맛·식감 근거, 여러 후기의 일치, 재방문 언급, 홍보성 자료의 신뢰도입니다. 자료가 빈약하면 점수를 지어내지 않고 `--`로 둡니다.

## 무료 서비스 한도

- Tavily 무료 계정: 월 1,000 검색 크레딧, 카드 등록 없이 시작 가능
- Gemini API 무료 등급: 텍스트 모델 이용량 한도 내 무료. 실제 일일 한도는 계정별 AI Studio 화면에 표시됩니다.
- Cloudflare Workers 무료 등급: 하루 100,000 요청 한도

한도는 제공사의 변경 대상입니다. Tavily에서 종량제 결제를 켜지 말고, Gemini 프로젝트에는 결제를 연결하지 마세요. 그러면 무료 한도를 넘긴 호출은 실패하고 비용이 청구되지 않습니다. Gemini 무료 등급으로 전송한 프롬프트·응답은 Google 제품 개선에 사용될 수 있으므로 검색어 외 개인정보는 보내지 않습니다.

## 계정 키 발급 및 배포

1. Tavily에서 무료 계정을 만들고 API 키를 발급합니다: https://www.tavily.com/
2. Google AI Studio에서 Gemini API 키를 발급합니다: https://aistudio.google.com/app/apikey
3. PC에 Node.js가 설치되어 있으면 PowerShell에서 프로젝트의 `worker` 폴더로 이동해 다음 순서로 진행합니다.
   - `npx wrangler login` (브라우저에서 Cloudflare 로그인)
   - `npx wrangler secret put TAVILY_API_KEY`
   - 화면에 입력란이 나오면 Tavily 키를 붙여넣고 Enter
   - `npx wrangler secret put GEMINI_API_KEY`
   - 화면에 입력란이 나오면 Gemini 키를 붙여넣고 Enter
   - `npx wrangler deploy`
   첫 배포 시 Cloudflare 무료 계정이 필요합니다. 키는 입력할 때 화면에 표시되지 않으며 저장소에는 기록되지 않습니다.
4. Worker의 **Settings → Variables and Secrets**에서 다음 비밀 변수를 설정합니다. 값은 GitHub에 올리지 않습니다.
   - `TAVILY_API_KEY`
   - `GEMINI_API_KEY`
5. 배포가 끝나면 Worker URL을 복사합니다.
6. `index.html`에서 `EVALUATOR_API_URL` 값을 Worker URL로 바꿔 GitHub에 올립니다.

## 동작 및 점수 제한

초기 검색에서는 식당 최대 8곳을 평가합니다. 식당마다 Tavily 검색 1회와 Gemini 평가 1회를 사용합니다. 결과 점수는 공식 평점이 아니라 검색된 공개 자료에 대한 모델의 근거 기반 판단입니다. 검색 발췌가 충분하지 않거나 해당 메뉴의 실제 후기를 확인하지 못하면 `--`가 나올 수 있습니다. 점수 이유는 결과의 점수에 마우스를 올리거나 식당을 눌러 상세 정보의 평가 근거 링크를 확인할 수 있습니다.
