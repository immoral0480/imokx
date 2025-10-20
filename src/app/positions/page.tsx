'use client';

import { useEffect, useState } from 'react';
import PositionCard from '@/components/PositionCard';

interface PositionData {
  symbol: string;
  qty: string;
  leverage: string;
  realizedPNL: string;
  fee: string;
  marginMode: string;
  side: string;
}

export default function PositionPage() {
  const [position, setPosition] = useState<PositionData | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('https://aitrading.ac/api/sse');

    eventSource.onopen = () => {
      console.log('✅ SSE 연결됨');
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: PositionData = JSON.parse(event.data);
        console.log('📩 받은 포지션:', data);
        setPosition(data);
      } catch (err) {
        console.error('❌ JSON 파싱 오류:', err);
        setError('데이터 형식 오류');
      }
    };

    eventSource.onerror = (err) => {
      console.error('❌ SSE 에러:', err);
      setConnected(false);
      setError('서버와의 연결이 끊어졌습니다.');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <main className="min-h-screen bg-black text-white p-4">
      <h1 className="text-2xl font-bold mb-4">📡 coinw 실시간 포지션</h1>

      {error && <p className="text-red-500 mb-2">⚠️ {error}</p>}
      {!connected && !error && <p className="text-yellow-400 mb-2">⏳ 서버 연결 대기 중...</p>}

      {position ? (
        <PositionCard position={position} />
      ) : (
        <p>⏳ 포지션 없음 또는 수신 대기 중...</p>
      )}
    </main>
  );
}
