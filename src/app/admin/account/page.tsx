export default function AdminPolygonBalancesPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">폴리곤잔액</h1>
      <p className="text-sm text-gray-600">
        운영/센터/개별 지갑의 USDT·MATIC 잔액을 모니터링합니다.
      </p>
      {/* TODO: 운영 지갑 카드, 임계치 경고, 스냅샷 저장/엑셀 */}
    </section>
  );
}
