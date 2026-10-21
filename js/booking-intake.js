// Shared choices keep the booking form, server validation and admin labels consistent.
export const genders = [
  ["male", "남성"], ["female", "여성"],
];
export const intakeGroups = [
  { name: "referralSources", title: "어떤 경로로 알게 되셨나요?", choices: [
    ["sign", "간판"], ["banner", "배너"], ["flyer", "전단지"], ["street-banner", "현수막"],
    ["bus", "버스 광고"], ["search", "인터넷 검색"], ["daangn", "당근"],
    ["instagram", "인스타그램"], ["newspaper", "신문지"], ["friend", "지인 추천"], ["other", "기타"],
  ] },
  { name: "treatmentHistory", title: "경험해 본 치료 방법이 있나요?", choices: [
    ["surgery", "수술치료"], ["procedure", "시술치료"], ["injection", "주사치료"],
    ["manual", "도수치료"], ["oriental", "한방치료"], ["chiropractic", "카이로프랙틱 / 추나치료"],
    ["other", "기타"], ["none", "없음"],
  ] },
  { name: "exerciseHistory", title: "경험해 본 운동이 있나요?", choices: [
    ["rehabilitation", "재활운동"], ["gym", "헬스"], ["pt", "PT"], ["pilates", "필라테스"],
    ["yoga", "요가"], ["crossfit", "크로스핏"], ["gx", "G.X"], ["none", "없음"],
  ] },
];
export function intakeRows(intake) {
  if (!intake) return [];
  const labels = (name, values) => {
    const options = intakeGroups.find(group => group.name === name).choices;
    return Array.isArray(values) ? values.map(value => options.find(([id]) => id === value)?.[1] || value).join(", ") : "";
  };
  return [
    ["생년월일", intake.birthDate?.replaceAll("-", ".")],
    ["성별", genders.find(([id]) => id === intake.gender)?.[1] || (intake.gender === "other" ? "기타" : "미입력")],
    ["알게 된 경로", labels("referralSources", intake.referralSources)],
    ["방문 목적", intake.visitPurpose],
    ["치료 경험", labels("treatmentHistory", intake.treatmentHistory)],
    ["운동 경험", labels("exerciseHistory", intake.exerciseHistory)],
    ["요청사항", intake.requests || "없음"],
  ];
}
