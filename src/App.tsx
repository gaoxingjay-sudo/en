import { FileUp, Scan, AlertCircle, RefreshCw, BookOpen, Clock, Upload, Play, Mic, ArrowLeft, Camera, Save, Trash2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type, Modality } from '@google/genai';

// Mock data for fallback/demo
const mockArticleData = {
  title: "Exploring the Future of Artificial Intelligence",
  paragraphs: [
    [
      { id: "s1", text: "Artificial intelligence is no longer a concept of science fiction.", translation: "人工智能不再是科幻小说中的概念。" },
      { id: "s2", text: "It has become an integral part of our daily lives, from personal assistants on our smartphones to complex algorithms that drive our financial markets.", translation: "它已成为我们日常生活中不可或缺的一部分，从智能手机上的个人助手到驱动金融市场的复杂算法。" },
      { id: "s3", text: "As we move forward, the ethical implications of these technologies become increasingly significant.", translation: "随着我们不断前进，这些技术的伦理影响变得越来越重要。" }
    ],
    [
      { id: "s4", text: "Many experts argue that we must establish global standards for AI safety.", translation: "许多专家认为，我们必须建立全球人工智能安全标准。" },
      { id: "s5", text: "This ensures that machine learning systems remain transparent and accountable to their human creators.", translation: "这确保了机器学习系统对其人类创造者保持透明和负责。" },
      { id: "s6", text: "The transition might be challenging, but the potential benefits for healthcare and education are immense.", translation: "这种转变可能充满挑战，但对医疗保健和教育的潜在好处是巨大的。" }
    ],
    [
      { id: "s7", text: "Looking ahead, researchers are focusing on making AI more intuitive and empathetic.", translation: "展望未来，研究人员正致力于使人工智能更加直观和具有同理心。" },
      { id: "s8", text: "This evolution could redefine the way we interact with machines entirely.", translation: "这种演变可能会彻底重新定义我们与机器互动的方式。" }
    ]
  ]
};

type AppState = 'upload' | 'reading';
type UploadStatus = 'idle' | 'processing' | 'error';

export default function App() {
  // App Navigation State
  const [appState, setAppState] = useState<AppState>('upload');
  
  // Upload States
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Saved Articles State
  const [savedArticles, setSavedArticles] = useState<any[]>(() => {
    const saved = localStorage.getItem('linguscan_saved');
    return saved ? JSON.parse(saved) : [];
  });

  // Reading States
  const [articleData, setArticleData] = useState<any>(null);
  const [activeSentenceId, setActiveSentenceId] = useState<string>('');
  const [showTranslation, setShowTranslation] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  // Audio & Scoring States
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [scores, setScores] = useState({ fluency: '-', accuracy: '-', tempo: '-' });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Caching and Full Playback States
  const audioCache = useRef<Record<string, string>>({});
  const isPlayingAllRef = useRef(false);
  const [isPlayingAllState, setIsPlayingAllState] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsVoice, setTtsVoice] = useState('');

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const englishVoices = voices.filter(v => v.lang.startsWith('en'));
      setAvailableVoices(englishVoices);
      if (englishVoices.length > 0 && !ttsVoice) {
        // Try to find a good default voice
        const defaultVoice = englishVoices.find(v => v.name.includes('Google US English')) || englishVoices[0];
        setTtsVoice(defaultVoice.name);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [ttsVoice]);

  // Reset audio states when active sentence changes manually
  useEffect(() => {
    setIsTtsLoading(false);
    setUserAudioUrl(null);
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setScores({ fluency: '-', accuracy: '-', tempo: '-' });
  }, [activeSentenceId]);

  const playTTS = async (sentenceId: string, text: string, isContinuous = false) => {
    if (isTtsLoading) return;
    
    window.speechSynthesis.cancel();
    if (currentAudio) {
      setCurrentAudio(null);
    }

    if (!isContinuous) {
      isPlayingAllRef.current = false;
      setIsPlayingAllState(false);
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = availableVoices.find(v => v.name === ttsVoice);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      setCurrentAudio({ pause: () => window.speechSynthesis.cancel() } as any);
    };

    utterance.onend = () => {
      setCurrentAudio(null);
      if (isPlayingAllRef.current) {
        const allSentences = articleData?.paragraphs?.flat() || [];
        const currentIndex = allSentences.findIndex((s: any) => s.id === sentenceId);
        if (currentIndex >= 0 && currentIndex < allSentences.length - 1) {
          const nextSentence = allSentences[currentIndex + 1];
          setActiveSentenceId(nextSentence.id);
          playTTS(nextSentence.id, nextSentence.text, true);
        } else {
          isPlayingAllRef.current = false;
          setIsPlayingAllState(false);
        }
      }
    };

    utterance.onerror = (e) => {
      console.error("TTS Error", e);
      setCurrentAudio(null);
      isPlayingAllRef.current = false;
      setIsPlayingAllState(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const togglePlayAll = () => {
    if (isPlayingAllRef.current) {
      isPlayingAllRef.current = false;
      setIsPlayingAllState(false);
      if (currentAudio) {
        currentAudio.pause();
        setCurrentAudio(null);
      }
    } else {
      isPlayingAllRef.current = true;
      setIsPlayingAllState(true);
      const allSentences = articleData?.paragraphs?.flat() || [];
      const startIndex = allSentences.findIndex((s: any) => s.id === activeSentenceId);
      const startSentence = startIndex >= 0 ? allSentences[startIndex] : allSentences[0];
      if (startSentence) {
        setActiveSentenceId(startSentence.id);
        playTTS(startSentence.id, startSentence.text, true);
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setUserAudioUrl(url);
        
        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());

        // Trigger scoring
        await scoreAudio(audioBlob, activeSentence.text);
      };

      recorder.start();
      setIsRecording(true);
      setUserAudioUrl(null);
      setScores({ fluency: '-', accuracy: '-', tempo: '-' });
    } catch (e) {
      console.error("Mic error", e);
      alert("Microphone access denied or error occurred.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const scoreAudio = async (blob: Blob, targetText: string) => {
    setIsScoring(true);
    try {
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result.split(',')[1]);
          } else {
            reject(new Error("Failed to read audio blob"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const mimeType = blob.type || 'audio/webm';
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64data,
                mimeType: mimeType
              }
            },
            {
              text: `Listen to this audio and compare it to the target text: "${targetText}". Evaluate the pronunciation. Return a JSON object with: "fluency" (A, B, C, D, or F), "accuracy" (0-100 number), and "tempo" (Slow, Good, or Fast).`
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fluency: { type: Type.STRING },
              accuracy: { type: Type.NUMBER },
              tempo: { type: Type.STRING }
            }
          }
        }
      });

      if (response.text) {
        const result = JSON.parse(response.text);
        setScores({
          fluency: result.fluency || 'N/A',
          accuracy: result.accuracy?.toString() || 'N/A',
          tempo: result.tempo || 'N/A'
        });
      }
    } catch (e) {
      console.error("Scoring error", e);
      setScores({ fluency: 'Err', accuracy: 'Err', tempo: 'Err' });
    } finally {
      setIsScoring(false);
    }
  };

  const processImage = async (file: File) => {
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG, PNG, WEBP) for OCR.');
      return;
    }

    setUploadStatus('processing');
    setProgress(0);
    setUploadError('');

    const progressInterval = setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + Math.floor(Math.random() * 10) : prev));
    }, 300);

    try {
      // Resize image before sending to API to prevent payload too large errors
      const resizedBase64 = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimension 2000px
          const MAX_DIMENSION = 2000;
          if (width > height && width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          // Compress to JPEG with 0.8 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl.split(',')[1]);
        };
        img.onerror = () => reject(new Error("Failed to load image for resizing"));
        img.src = URL.createObjectURL(file);
      });

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: resizedBase64,
                mimeType: 'image/jpeg'
              }
            },
            {
              text: "You are an expert OCR and translation assistant. Extract all the text from this image. Break it down into logical paragraphs, and then break each paragraph into sentences. For each sentence, provide a high-quality Chinese translation. Return the result strictly as a JSON object matching the schema. If there is no text, return a title 'No Text Found' and an empty paragraphs array."
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "A suitable title for the extracted text" },
              paragraphs: {
                type: Type.ARRAY,
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "A unique ID like s1, s2, etc." },
                      text: { type: Type.STRING, description: "The English sentence" },
                      translation: { type: Type.STRING, description: "The Chinese translation of the sentence" }
                    },
                    required: ["id", "text", "translation"]
                  }
                }
              }
            },
            required: ["title", "paragraphs"]
          }
        }
      });

      clearInterval(progressInterval);
      setProgress(100);
      
      if (response.text) {
        const parsedData = JSON.parse(response.text);
        setArticleData(parsedData);
        if (parsedData.paragraphs && parsedData.paragraphs.length > 0 && parsedData.paragraphs[0].length > 0) {
          setActiveSentenceId(parsedData.paragraphs[0][0].id);
        }
        
        setTimeout(() => {
          setUploadStatus('idle');
          setAppState('reading');
        }, 500);
      } else {
        throw new Error("No response text from AI");
      }
    } catch (error: any) {
      console.error('OCR Error:', error);
      setUploadError(error?.message || String(error));
      clearInterval(progressInterval);
      setUploadStatus('error');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImage(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processImage(e.target.files[0]);
    }
  };

  const resetUpload = () => {
    setUploadStatus('idle');
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const loadDemo = () => {
    setArticleData(mockArticleData);
    setActiveSentenceId(mockArticleData.paragraphs[0][0].id);
    setAppState('reading');
  };

  const saveArticle = () => {
    if (!articleData) return;
    const isAlreadySaved = savedArticles.some(a => a.title === articleData.title);
    if (isAlreadySaved) {
      alert('This article is already saved!');
      return;
    }
    const articleToSave = { ...articleData, savedAt: Date.now() };
    const newSaved = [articleToSave, ...savedArticles];
    setSavedArticles(newSaved);
    localStorage.setItem('linguscan_saved', JSON.stringify(newSaved));
    alert('Article saved successfully!');
  };

  const deleteSavedArticle = (title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSaved = savedArticles.filter(a => a.title !== title);
    setSavedArticles(newSaved);
    localStorage.setItem('linguscan_saved', JSON.stringify(newSaved));
  };

  const loadSavedArticle = (article: any) => {
    setArticleData(article);
    setActiveSentenceId(article.paragraphs[0]?.[0]?.id || '');
    setAppState('reading');
  };

  // Find the active sentence data for reading view
  const activeSentence = articleData?.paragraphs
    ?.flat()
    .find((s: any) => s.id === activeSentenceId) || articleData?.paragraphs?.[0]?.[0] || { text: '', translation: '' };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-slate-800 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-10 shrink-0">
        <div className="max-w-[1600px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              {appState === 'upload' ? <Scan className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
            </div>
            <span className="font-bold text-xl tracking-tight">LinguScan Reader</span>
          </div>
          <div className="flex items-center gap-4">
            {appState === 'reading' ? (
              <button 
                onClick={() => setAppState('upload')}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors font-medium text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Upload
              </button>
            ) : (
              <button 
                onClick={loadDemo}
                className="flex items-center gap-2 px-4 py-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors font-medium text-sm"
              >
                <Play className="w-4 h-4" />
                Try Demo
              </button>
            )}
          </div>
        </div>
      </header>

      {appState === 'upload' ? (
        <main className="max-w-5xl mx-auto px-6 py-12 flex-1 w-full">
          <section className="mb-12">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Upload Document for Reading</h1>
              <p className="text-slate-500">Scan English text to practice reading and listen to AI-generated audio.</p>
            </div>

            <div 
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all shadow-sm ${
                isDragging ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept="image/png, image/jpeg, image/webp"
              />
              <input 
                type="file" 
                ref={cameraInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept="image/*"
                capture="environment"
              />
              
              <AnimatePresence mode="wait">
                {uploadStatus === 'idle' && (
                  <motion.div 
                    key="idle"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileUp className="w-10 h-10" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-700">
                        Drag & Drop or <span className="text-indigo-600 cursor-pointer hover:underline" onClick={() => fileInputRef.current?.click()}>Browse</span>
                      </p>
                      <p className="text-sm text-slate-400 mt-1">Supports JPG, PNG, WEBP (Max 10MB)</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                      >
                        <Upload className="w-5 h-5" />
                        Select Image
                      </button>
                      <button 
                        onClick={() => cameraInputRef.current?.click()}
                        className="w-full sm:w-auto px-6 py-2.5 bg-white text-indigo-600 border border-indigo-200 font-semibold rounded-xl hover:bg-indigo-50 transition-colors shadow-sm flex items-center justify-center gap-2"
                      >
                        <Camera className="w-5 h-5" />
                        Take Photo
                      </button>
                    </div>
                  </motion.div>
                )}

                {uploadStatus === 'processing' && (
                  <motion.div 
                    key="processing"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    className="space-y-6 py-8"
                  >
                    <div className="max-w-md mx-auto">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-indigo-600">Extracting text & translating...</span>
                        <span className="text-sm font-bold text-slate-600">{progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <motion.div 
                          className="bg-indigo-600 h-full rounded-full" 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {uploadStatus === 'error' && (
                  <motion.div 
                    key="error"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 py-4"
                  >
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <p className="text-lg font-semibold text-slate-700">Failed to process image</p>
                    {uploadError && (
                      <p className="text-sm text-red-500 max-w-md mx-auto">{uploadError}</p>
                    )}
                    <button 
                      onClick={resetUpload}
                      className="mt-2 px-6 py-2 bg-white border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors inline-flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Try Again
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Saved Articles Section */}
          {savedArticles.length > 0 && (
            <section className="mt-12">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Saved Articles</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedArticles.map((article, index) => (
                  <div 
                    key={index}
                    onClick={() => loadSavedArticle(article)}
                    className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group relative"
                  >
                    <h3 className="font-bold text-lg text-slate-800 mb-2 line-clamp-2 pr-8">{article.title || "Untitled Document"}</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      {new Date(article.savedAt).toLocaleDateString()} • {article.paragraphs?.flat().length || 0} sentences
                    </p>
                    <div className="text-indigo-600 text-sm font-medium flex items-center gap-1">
                      <BookOpen className="w-4 h-4" /> Read Again
                    </div>
                    <button 
                      onClick={(e) => deleteSavedArticle(article.title, e)}
                      className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete saved article"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      ) : (
        <main className="flex-1 flex flex-col lg:flex-row overflow-hidden max-w-[1600px] w-full mx-auto">
          {/* Left Panel: Reading Area */}
          <section className="flex-1 p-4 sm:p-8 overflow-y-auto bg-white border-r border-slate-200">
            <div className="max-w-3xl mx-auto">
              <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 mb-2">{articleData?.title || "Untitled Document"}</h1>
                  <p className="text-slate-500 italic">Scanned Document</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={saveArticle}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full font-medium transition-colors shadow-sm shrink-0 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </button>
                  <button 
                    onClick={togglePlayAll}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-colors shadow-sm shrink-0 ${
                      isPlayingAllState 
                        ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {isPlayingAllState ? <div className="w-4 h-4 bg-indigo-700 rounded-sm" /> : <Play className="w-4 h-4 fill-current" />}
                    <span>{isPlayingAllState ? 'Stop Reading' : 'Read Full Article'}</span>
                  </button>
                </div>
              </div>
              
              <article className="space-y-6 text-lg leading-relaxed text-slate-700">
                {articleData?.paragraphs?.map((paragraph: any[], pIndex: number) => (
                  <p key={pIndex}>
                    {paragraph.map((sentence: any) => {
                      const isActive = sentence.id === activeSentenceId;
                      return (
                        <span
                          key={sentence.id}
                          onClick={() => {
                            setActiveSentenceId(sentence.id);
                            isPlayingAllRef.current = false;
                            setIsPlayingAllState(false);
                            if (currentAudio) {
                              currentAudio.pause();
                              setCurrentAudio(null);
                            }
                          }}
                          className={`cursor-pointer px-1 rounded transition-all duration-200 inline-block ${
                            isActive 
                              ? 'bg-indigo-100/60 border-l-4 border-indigo-600 -ml-[4px] py-0.5' 
                              : 'hover:bg-indigo-50 border-l-4 border-transparent -ml-[4px] py-0.5'
                          }`}
                        >
                          {sentence.text}{' '}
                        </span>
                      );
                    })}
                  </p>
                ))}
                {(!articleData?.paragraphs || articleData.paragraphs.length === 0) && (
                  <p className="text-slate-400 italic">No text could be extracted from this image.</p>
                )}
              </article>
            </div>
          </section>

          {/* Right Panel: Sidebar */}
          <aside className="w-full lg:w-[400px] bg-slate-50 p-6 flex flex-col gap-6 overflow-y-auto shrink-0">
            
            {/* Current Sentence Card */}
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 shrink-0">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Current Sentence</h2>
              
              <div className="space-y-4">
                <p className="text-lg font-medium text-slate-900 leading-snug min-h-[80px]">
                  {activeSentence.text || "Select a sentence to begin."}
                </p>
                
                {/* Audio Controls */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        if (currentAudio && !isPlayingAllState) {
                          currentAudio.pause();
                          setCurrentAudio(null);
                        } else {
                          playTTS(activeSentence.id, activeSentence.text, false);
                        }
                      }}
                      disabled={isTtsLoading || !activeSentence.text}
                      className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-full hover:bg-slate-800 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {isTtsLoading ? (
                        <motion.span 
                          animate={{ rotate: 360 }} 
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                        />
                      ) : (currentAudio && !isPlayingAllState) ? (
                        <div className="w-3 h-3 bg-white rounded-sm" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                      <span>{isTtsLoading ? 'Generating...' : (currentAudio && !isPlayingAllState) ? 'Stop Audio' : 'Play AI Audio'}</span>
                    </button>
                    
                    <select 
                      value={ttsVoice} 
                      onChange={(e) => setTtsVoice(e.target.value)}
                      className="text-sm border border-slate-200 rounded-md px-2 py-2 bg-white text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 max-w-[150px] truncate"
                    >
                      {availableVoices.length === 0 && <option value="">Loading voices...</option>}
                      {availableVoices.map(v => (
                        <option key={v.name} value={v.name}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Mock Waveform */}
                  <div className="flex items-end gap-0.5 h-8 w-24 px-2">
                    {[40, 70, 30, 80, 60, 50, 90, 40].map((h, i) => (
                      <motion.div 
                        key={i}
                        className={`w-1 rounded-full ${currentAudio ? 'bg-indigo-500' : 'bg-slate-200'}`}
                        animate={currentAudio ? { height: [`${h}%`, `${Math.max(20, h - 20)}%`, `${h}%`] } : { height: '20%' }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
                        style={{ height: currentAudio ? `${h}%` : '20%' }}
                      />
                    ))}
                  </div>
                </div>

                {/* Translation Toggle */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-slate-600">Translation (Chinese)</span>
                    <button 
                      onClick={() => setShowTranslation(!showTranslation)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${showTranslation ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    >
                      <motion.span
                        className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform"
                        animate={{ translateX: showTranslation ? 22 : 2 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>
                  
                  <AnimatePresence initial={false}>
                    {showTranslation && activeSentence.translation && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm leading-relaxed">
                          {activeSentence.translation}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </section>

            {/* Record & Compare Card */}
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex-1 flex flex-col">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-6 text-center">Record & Compare</h2>
              
              <div className="flex flex-col items-center gap-8 flex-1">
                {/* Record Button */}
                <div className="relative group">
                  {isRecording && (
                    <motion.div 
                      className="absolute -inset-4 bg-red-500/20 rounded-full"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}
                  <button 
                    onClick={toggleRecording}
                    className={`relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
                      isRecording ? 'bg-red-600 scale-95' : 'bg-red-500 hover:scale-105 hover:bg-red-600 shadow-red-500/40'
                    }`}
                  >
                    {isRecording ? <div className="w-6 h-6 bg-white rounded-sm" /> : <Mic className="w-8 h-8 text-white" />}
                  </button>
                </div>

                {/* Waveform Comparison */}
                <div className="w-full space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <span>AI Native</span>
                      <span className="text-indigo-600">Match: {scores.accuracy !== '-' ? `${scores.accuracy}%` : '--'}</span>
                    </div>
                    <div className="h-12 bg-slate-50 rounded-lg flex items-center justify-center gap-1 px-4 overflow-hidden border border-slate-100">
                      {/* Static AI Waveform */}
                      {[20, 40, 60, 80, 50, 90, 70, 30, 40, 60, 80, 50, 30, 20].map((h, i) => (
                        <div key={i} className={`w-1 rounded-full ${currentAudio ? 'bg-indigo-400' : 'bg-slate-300'}`} style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <span>Your Recording</span>
                      <span className="text-slate-500">{isRecording ? 'Recording...' : isScoring ? 'Scoring...' : 'Ready to record...'}</span>
                    </div>
                    <div className={`h-12 rounded-lg flex items-center justify-center gap-1 px-4 border-2 transition-colors ${
                      isRecording ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-dashed border-slate-200'
                    }`}>
                      {isRecording ? (
                         <div className="flex items-end gap-1 h-full py-2">
                         {[30, 60, 40, 80, 50, 70, 40, 90, 60, 30].map((h, i) => (
                           <motion.div 
                             key={i}
                             className="bg-red-400 w-1 rounded-full"
                             animate={{ height: [`${Math.random() * 100}%`, `${Math.random() * 100}%`] }}
                             transition={{ duration: 0.3, repeat: Infinity, repeatType: "mirror" }}
                           />
                         ))}
                       </div>
                      ) : userAudioUrl ? (
                        <audio controls src={userAudioUrl} className="h-8 w-full max-w-[200px]" />
                      ) : (
                        <div className="text-slate-400 text-sm font-medium">Click microphone to start</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Scores */}
                <div className="grid grid-cols-3 w-full gap-2 mt-auto">
                  <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-1">Fluency</div>
                    <div className="text-xl font-bold text-emerald-700">{isScoring ? '...' : scores.fluency}</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-1">Accuracy</div>
                    <div className="text-xl font-bold text-blue-700">{isScoring ? '...' : scores.accuracy}</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-amber-50 border border-amber-100">
                    <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-1">Tempo</div>
                    <div className="text-xl font-bold text-amber-700">{isScoring ? '...' : scores.tempo}</div>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </main>
      )}
    </div>
  );
}

