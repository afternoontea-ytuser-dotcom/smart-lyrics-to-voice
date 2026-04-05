/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Upload, 
  FileVideo, 
  Play, 
  Volume2, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Type,
  Languages,
  Key,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const API_KEY_ENV = process.env.GEMINI_API_KEY || "";

export default function App() {
  const [localApiKey, setLocalApiKey] = useState<string>(() => {
    return localStorage.getItem('GEMINI_API_KEY_FALLBACK') || "";
  });
  const effectiveApiKey = API_KEY_ENV || localApiKey;

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'processing' | 'result'>('upload');
  const [mode, setMode] = useState<'video' | 'text'>('video');
  const [pastedText, setPastedText] = useState<string>("");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // TTS Settings
  const [voice, setVoice] = useState<'Kore' | 'Puck' | 'Fenrir' | 'Charon' | 'Zephyr'>('Kore');
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [pitch, setPitch] = useState<'low' | 'normal' | 'high'>('normal');
  const [targetLanguage, setTargetLanguage] = useState<string>("普通話");
  const [voiceStyle, setVoiceStyle] = useState<'gentle' | 'lively' | 'professional'>('gentle');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetApp = () => {
    setVideoFile(null);
    setVideoPreview(null);
    setExtractedText("");
    setPastedText("");
    setAudioUrl(null);
    setIsProcessing(false);
    setProcessingStep("");
    setError(null);
    setStep('upload');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      // Limit to 15MB for stability
      if (file.size > 15 * 1024 * 1024) {
        setError("影片檔案太大（請小於 15MB）。");
        return;
      }
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setError(null);
      setStep('upload');
    } else {
      setError("請上傳有效的影片檔案。");
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const generateSpeech = async (text: string) => {
    if (!effectiveApiKey) {
      throw new Error("API Key 缺失。請在設定中提供有效的 API Key。");
    }
    try {
      const ai = new GoogleGenAI({ apiKey: effectiveApiKey });
      setProcessingStep(`正在生成${targetLanguage}語音...`);
      
      const speedText = speed === 'slow' ? '語速緩慢' : speed === 'fast' ? '語速較快' : '語速正常';
      const pitchText = pitch === 'low' ? '語調低沉' : pitch === 'high' ? '語調高昂' : '語調自然';
      const styleText = voiceStyle === 'lively' ? '活潑且充滿活力' : voiceStyle === 'professional' ? '專業且沉穩' : '溫柔且清晰';
      const voiceRole = voice === 'Fenrir' ? '小孩' : voice === 'Puck' ? '年輕男性' : voice === 'Charon' ? '成熟男性' : voice === 'Zephyr' ? '溫柔女性' : '女性';

      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `請以${voiceRole}的聲音，${styleText}地用${targetLanguage}朗讀以下文字（${speedText}，${pitchText}）：\n\n${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        setProcessingStep("正在處理音訊格式...");
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        
        const audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 24000);
        const channelData = audioBuffer.getChannelData(0);
        
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < channelData.length; i++) {
          channelData[i] = view.getInt16(i * 2, true) / 32768.0;
        }

        const wavBlob = await bufferToWav(audioBuffer);
        setAudioUrl(URL.createObjectURL(wavBlob));
        await audioContext.close();
      } else {
        throw new Error("語音生成失敗，請稍後再試。");
      }
    } catch (err: any) {
      throw err;
    }
  };

  const regenerateSpeech = async () => {
    if (!extractedText) return;
    setIsProcessing(true);
    setError(null);
    const prevStep = step;
    setStep('processing');
    try {
      await generateSpeech(extractedText);
      setStep('result');
    } catch (err: any) {
      setError(err.message || "重新生成失敗。");
      setStep(prevStep);
    } finally {
      setIsProcessing(false);
      setProcessingStep("");
    }
  };

  const processText = async () => {
    if (!pastedText.trim()) {
      setError("請輸入文字內容。");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStep('processing');
    setProcessingStep("正在準備文字內容...");
    setExtractedText(pastedText);
    setAudioUrl(null);

    try {
      await generateSpeech(pastedText);
      setStep('result');
    } catch (err: any) {
      console.error("Processing Error:", err);
      setError(err.message || "處理過程中發生錯誤。");
      setStep('upload');
    } finally {
      setIsProcessing(false);
      setProcessingStep("");
    }
  };

  const processVideo = async () => {
    if (!videoFile) return;
    if (!effectiveApiKey) {
      setError("API Key 缺失。請在下方提供有效的 API Key。");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStep('processing');
    setProcessingStep("正在讀取影片檔案...");
    setExtractedText("");
    setAudioUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: effectiveApiKey });
      const base64Video = await fileToBase64(videoFile);

      setProcessingStep("正在分析影片並提取文字...");
      // Step 1: Extract text from video (OCR + Transcription)
      const textResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            inlineData: {
              data: base64Video,
              mimeType: videoFile.type,
            },
          },
          {
            text: "請提取這段影片中的所有文字內容。包括影片中出現的文字（OCR）以及影片中的語音轉錄。請直接返回提取到的文字內容，不要有額外的解釋。如果是多種語言，請統一整理。",
          },
        ],
      });

      const text = textResponse.text || "";
      if (!text.trim()) {
        throw new Error("未能從影片中提取到任何文字內容。");
      }
      setExtractedText(text);

      await generateSpeech(text);
      setStep('result');
    } catch (err: any) {
      console.error("Processing Error:", err);
      let errorMessage = "處理過程中發生錯誤。";
      if (err.message?.includes("quota")) {
        errorMessage = "API 使用額度已達上限，請稍後再試。";
      } else if (err.message?.includes("network")) {
        errorMessage = "網路連接不穩定，請檢查網路後重試。";
      } else {
        errorMessage = err.message || errorMessage;
      }
      setError(errorMessage);
      setStep('upload');
    } finally {
      setIsProcessing(false);
      setProcessingStep("");
    }
  };

  // Helper to convert AudioBuffer to WAV
  const bufferToWav = (buffer: AudioBuffer): Promise<Blob> => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const outBuffer = new ArrayBuffer(length);
    const view = new DataView(outBuffer);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (hardcoded in this helper)

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for (i = 0; i < buffer.numberOfChannels; i++)
      channels.push(buffer.getChannelData(i));

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        // interleave channels
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
        view.setInt16(pos, sample, true); // write 16-bit sample
        pos += 2;
      }
      offset++; // next source sample
    }

    return Promise.resolve(new Blob([outBuffer], { type: "audio/wav" }));

    function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <Languages size={20} />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-800">影片文字生成語音</h1>
          </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                className={`p-2 rounded-lg transition-colors ${showApiKeyInput ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}
                title="API 設定"
              >
                <Key size={20} />
              </button>
              {videoFile && (
                <button 
                  onClick={resetApp}
                  className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
                >
                  重置
                </button>
              )}
              <div className="text-xs font-medium text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">
                AI Powered
              </div>
            </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Mode Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-slate-200 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => { setMode('video'); resetApp(); }}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'video' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
            >
              影片轉語音
            </button>
            <button
              onClick={() => { setMode('text'); resetApp(); }}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
            >
              文字轉語音
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showApiKeyInput && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-8 bg-white rounded-2xl p-6 shadow-sm border border-slate-200"
            >
              <div className="max-w-md mx-auto space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Key size={18} className="text-indigo-500" />
                    API 金鑰設定
                  </h3>
                  <button 
                    onClick={() => setShowApiKeyInput(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    關閉
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gemini API Key</label>
                  <input 
                    type="password"
                    value={localApiKey}
                    placeholder="在此貼上你的 API Key..."
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    onChange={(e) => {
                      const val = e.target.value;
                      setLocalApiKey(val);
                      localStorage.setItem('GEMINI_API_KEY_FALLBACK', val);
                    }}
                  />
                  <p className="text-[10px] text-slate-500">
                    金鑰將儲存在你的瀏覽器本地 (LocalStorage)，不會上傳至任何伺服器。
                  </p>
                </div>
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                >
                  從 Google AI Studio 取得免費 Key <ExternalLink size={12} />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Upload & Preview */}
          <div className="lg:col-span-7 space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  {mode === 'video' ? (
                    <>
                      <FileVideo size={18} className="text-indigo-500" />
                      影片上傳
                    </>
                  ) : (
                    <>
                      <Type size={18} className="text-indigo-500" />
                      文字輸入
                    </>
                  )}
                </h2>
                {mode === 'video' && videoFile && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                  >
                    更換影片
                  </button>
                )}
              </div>

              <div className="p-6">
                {mode === 'video' ? (
                  !videoPreview ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer group"
                    >
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-500 transition-colors">
                        <Upload size={32} />
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-slate-700">點擊或拖拽影片至此</p>
                        <p className="text-sm text-slate-500 mt-1">支援 MP4, MOV, AVI 等格式</p>
                      </div>

                      <div className="mt-8 pt-8 border-t border-slate-100 w-full max-w-md">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 text-center">限制及注意事項</h4>
                        <ul className="grid grid-cols-1 gap-3 text-left">
                          <li className="flex items-start gap-2 text-xs text-slate-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1 shrink-0" />
                            <span>檔案大小限制為 15MB 以內以確保穩定性。</span>
                          </li>
                          <li className="flex items-start gap-2 text-xs text-slate-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1 shrink-0" />
                            <span>影片中的文字及語音越清晰，提取效果越佳。</span>
                          </li>
                          <li className="flex items-start gap-2 text-xs text-slate-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1 shrink-0" />
                            <span>處理時間取決於影片長度及網路速度。</span>
                          </li>
                        </ul>
                      </div>

                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="video/*"
                        className="hidden"
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-inner relative group">
                        <video 
                          src={videoPreview} 
                          controls 
                          className="w-full h-full object-contain"
                        />
                      </div>
                      
                      {step === 'upload' && (
                        <div className="space-y-6">
                          {/* Voice Settings */}
                          <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                              <Languages size={14} />
                              語音設定
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600">聲音類型</label>
                                <select 
                                  value={voice}
                                  onChange={(e) => setVoice(e.target.value as any)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                  <option value="Kore">標準女聲 (Kore)</option>
                                  <option value="Zephyr">溫柔女聲 (Zephyr)</option>
                                  <option value="Puck">陽光男聲 (Puck)</option>
                                  <option value="Charon">成熟男聲 (Charon)</option>
                                  <option value="Fenrir">小孩/少年 (Fenrir)</option>
                                </select>
                              </div>

                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600">語速</label>
                                <select 
                                  value={speed}
                                  onChange={(e) => setSpeed(e.target.value as any)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                  <option value="slow">較慢</option>
                                  <option value="normal">正常</option>
                                  <option value="fast">較快</option>
                                </select>
                              </div>

                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600">語調</label>
                                <select 
                                  value={pitch}
                                  onChange={(e) => setPitch(e.target.value as any)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                  <option value="low">低沉</option>
                                  <option value="normal">正常</option>
                                  <option value="high">高昂</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={processVideo}
                            disabled={isProcessing}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="animate-spin" />
                                處理中...
                              </>
                            ) : (
                              <>
                                <Play size={20} fill="currentColor" />
                                開始轉換
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">請貼上文字內容</label>
                      <textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder="在此輸入或貼上想要轉換為語音的文字..."
                        className="w-full h-64 bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"
                      />
                    </div>

                    {step === 'upload' && (
                      <div className="space-y-6">
                        {/* Voice Settings */}
                        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 space-y-4">
                          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <Languages size={14} />
                            語音設定
                          </h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-slate-600">聲音類型</label>
                              <select 
                                value={voice}
                                onChange={(e) => setVoice(e.target.value as any)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="Kore">標準女聲 (Kore)</option>
                                <option value="Zephyr">溫柔女聲 (Zephyr)</option>
                                <option value="Puck">陽光男聲 (Puck)</option>
                                <option value="Charon">成熟男聲 (Charon)</option>
                                <option value="Fenrir">小孩/少年 (Fenrir)</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-slate-600">語音風格</label>
                              <select 
                                value={voiceStyle}
                                onChange={(e) => setVoiceStyle(e.target.value as any)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="gentle">溫柔清晰</option>
                                <option value="lively">活潑生動</option>
                                <option value="professional">專業沉穩</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-slate-600">目標語言</label>
                              <select 
                                value={targetLanguage}
                                onChange={(e) => setTargetLanguage(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="普通話">普通話</option>
                                <option value="粵語">粵語</option>
                                <option value="英語">英語 (English)</option>
                                <option value="日語">日語 (Japanese)</option>
                                <option value="韓語">韓語 (Korean)</option>
                                <option value="台語">台語</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-slate-600">語速</label>
                              <select 
                                value={speed}
                                onChange={(e) => setSpeed(e.target.value as any)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="slow">較慢</option>
                                <option value="normal">正常</option>
                                <option value="fast">較快</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-slate-600">語調</label>
                              <select 
                                value={pitch}
                                onChange={(e) => setPitch(e.target.value as any)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="low">低沉</option>
                                <option value="normal">正常</option>
                                <option value="high">高昂</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={processText}
                          disabled={isProcessing}
                          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="animate-spin" />
                              處理中...
                            </>
                          ) : (
                            <>
                              <Volume2 size={20} />
                              生成語音
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700"
                  >
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">{error}</p>
                      {!effectiveApiKey && (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-red-200 space-y-3">
                          <p className="text-xs text-slate-600 font-medium flex items-center gap-1">
                            <Key size={12} />
                            請輸入你的 Gemini API Key 以繼續：
                          </p>
                          <div className="flex gap-2">
                            <input 
                              type="password"
                              placeholder="在此貼上 API Key..."
                              className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                              onChange={(e) => {
                                const val = e.target.value;
                                setLocalApiKey(val);
                                localStorage.setItem('GEMINI_API_KEY_FALLBACK', val);
                              }}
                            />
                          </div>
                          <a 
                            href="https://aistudio.google.com/app/apikey" 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            從 Google AI Studio 取得免費 Key <ExternalLink size={10} />
                          </a>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </section>

            {/* Processing Status */}
            <AnimatePresence>
              {step === 'processing' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-indigo-600 rounded-2xl p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden"
                >
                  <div className="relative z-10 flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    <div>
                      <h3 className="text-xl font-bold">正在分析影片內容</h3>
                      <p className="text-indigo-100 mt-1">{processingStep || "Gemini 正在提取文字並生成普通話語音..."}</p>
                    </div>
                    <div className="w-full max-w-xs bg-white/20 h-1.5 rounded-full overflow-hidden mt-2">
                      <motion.div 
                        className="h-full bg-white"
                        animate={{ x: ["-100%", "100%"] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      />
                    </div>
                  </div>
                  {/* Decorative background circles */}
                  <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
                  <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-indigo-400/20 rounded-full blur-3xl" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-5 space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Type size={18} className="text-indigo-500" />
                  提取結果
                </h2>
                {step === 'result' && (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                    <CheckCircle2 size={12} />
                    完成
                  </span>
                )}
              </div>

              <div className="p-6 flex-1 flex flex-col gap-6">
                {step === 'result' ? (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{targetLanguage}語音</label>
                        <button 
                          onClick={regenerateSpeech}
                          disabled={isProcessing}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50"
                        >
                          <Loader2 size={12} className={isProcessing ? "animate-spin" : ""} />
                          重新生成
                        </button>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-md">
                          <Volume2 size={24} />
                        </div>
                        <div className="flex-1">
                          <audio src={audioUrl!} key={audioUrl!} controls className="w-full h-8" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 flex-1 flex flex-col">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">提取的文字</label>
                      <div className="flex-1 bg-slate-50 rounded-xl p-4 border border-slate-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-[400px]">
                        {extractedText}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-40">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-4">
                      <Type size={40} />
                    </div>
                    <p className="text-slate-500 font-medium">上傳影片後<br />提取的文字將顯示在此處</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 py-8 border-t border-slate-200 text-center">
        <p className="text-sm text-slate-400">
          Powered by Gemini 3 Flash & Gemini 2.5 Flash TTS
        </p>
      </footer>
    </div>
  );
}
