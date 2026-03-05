# Supabase 정리

## 사용하는 기능
- POST /api/visit : 방문 기록 저장
- GET  /api/visitors : total/today 방문자 수 집계
- GET  /api/rankings : 랭킹(Top1) 조회
- POST /api/submit : 점수 제출/업데이트
- GET/POST /api/export : 데이터 내보내기

## 환경변수 (로컬에는 .env.local / 배포는 Vercel env vars)
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- (필요 시) NEXT_PUBLIC_SUPABASE_ANON_KEY

## 원칙
- DB 접근은 서버(API route)에서만 수행
- service_role 키는 서버에서만 사용하며 GitHub에 절대 커밋하지 않음