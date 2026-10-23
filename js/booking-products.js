// 네이버 예약 상품 확인: 2026-10-20. 요금/구성 변경 시 이 목록을 함께 갱신합니다.
export const products = [
  {
    id: "sohn-exercise", trainer: "손진석 대표원장", title: "기능재활운동",
    duration: 50, price: 70000,
    description: "근력·유연성·움직임을 평가하고, 관절의 부담을 고려한 1:1 맞춤 운동을 진행합니다.",
    source: "https://m.booking.naver.com/booking/13/bizes/1429264/items/6811225",
  },
  {
    id: "sohn-stretch", trainer: "손진석 대표원장", title: "도수 재활 스트레칭",
    duration: 50, price: 70000,
    description: "관절의 움직임과 근육 상태를 살피고, 개인에게 맞는 스트레칭과 이완을 진행합니다.",
    source: "https://m.booking.naver.com/booking/13/bizes/1429264/items/7203500",
  },
  {
    id: "yun-exercise", trainer: "윤수진 원장", title: "기능재활운동",
    duration: 50, price: 50000,
    description: "신체 기능과 생활습관을 살펴, 일상 속 움직임과 근력 향상을 위한 운동을 진행합니다.",
    source: "https://m.booking.naver.com/booking/13/bizes/1429264/items/7579414",
  },
  {
    id: "yun-maternity", trainer: "윤수진 원장", title: "산전/산후 산모운동",
    duration: 50, price: 50000,
    description: "임신·출산으로 달라진 몸 상태를 고려해 코어와 골반 주변 근육의 회복을 돕습니다.",
    source: "https://m.booking.naver.com/booking/13/bizes/1429264/items/7493788",
  },
];
export const productLabel = product => `[${product.trainer}] ${product.title} (상담&체험)`;
