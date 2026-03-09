"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";

interface VoiceToTextProps {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
  className?: string;
  /** Placeholder when no recording */
  label?: string;
}

export function VoiceToText({ onTranscribed, disabled, className, label = "Dicter" }: VoiceToTextProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("file", blob, "recording.webm");
          const res = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.text) {
            onTranscribed(data.text);
          } else if (data.error) {
            console.error(data.error);
          }
        } finally {
          setIsTranscribing(false);
        }
      };

      mr.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Micro non disponible:", err);
    }
  }, [onTranscribed]);

  const handleClick = () => {
    if (isTranscribing) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || isTranscribing}
      onClick={handleClick}
      className={className}
      title={isRecording ? "Arrêter l'enregistrement" : isTranscribing ? "Transcription en cours..." : "Dicter (remplit le champ)"}
    >
      {isTranscribing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isRecording ? (
        <Square className="h-4 w-4 text-red-500 fill-red-500" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      <span className="ml-2">
        {isTranscribing ? "Transcription..." : isRecording ? "Arrêter" : label}
      </span>
    </Button>
  );
}
