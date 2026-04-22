# Color Palette VS Code Extension

Explorer 안에 Color Palette UI를 직접 렌더링하는 TypeScript 기반 확장프로그램입니다.

## 기능

- Explorer의 Color Palette 뷰에서 바로 UI 표시 (별도 에디터 패널 없음)
- 상단 팔레트 섹션 제거, 메인 컬러 컨트롤 패널 중심 UI
- Hex, RGB, HSL 형식 지원
- `+ Add` 버튼으로 현재 색상 로컬 저장
- 저장된 색상 클릭 시 즉시 적용
- Hex 입력란 변경 시 즉시 색상 반영

## 개발 실행

1. 의존성 설치

```bash
npm install
```

2. 빌드

```bash
npm run compile
```

3. 디버그 실행

- VS Code에서 현재 폴더 열기
- `F5` 실행 (Run Extension)
- 새 Extension Development Host 창의 Explorer에서 Color Palette 뷰 확인

## 메모

저장 색상은 VS Code extension globalState에 보관됩니다.
