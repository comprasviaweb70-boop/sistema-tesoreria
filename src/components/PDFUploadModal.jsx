
import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Edit3, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { extractPDFData } from '@/utils/extractPDFData';
import { validatePDFData } from '@/utils/PDFDataValidator';

const PDFUploadModal = ({ isOpen, onClose, onDataExtracted }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      toast({
        title: "Error",
        description: "Por favor selecciona un archivo PDF válido.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const result = await extractPDFData(selectedFile);

      if (result.success) {
        toast({
          title: "PDF procesado exitosamente",
          description: "Los valores han sido cargados directamente en el formulario.",
          className: "bg-green-500/10 text-green-500 border-green-500/50"
        });
        onDataExtracted(result.data);
        handleClose();
      } else {
        toast({
          title: "Error de extracción",
          description: "No se pudieron leer los datos. Verifica el formato e intenta nuevamente.",
          variant: "destructive",
        });
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('PDF Processing error:', error);
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setIsProcessing(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px] glass-card border-border/50 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl">Cargar Cierre PDF</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Los datos serán extraídos y aplicados automáticamente al registro actual.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              <p className="text-sm font-medium animate-pulse">Procesando archivo...</p>
            </div>
          ) : (
            <div className="border-2 border-dashed border-primary/50 bg-secondary/20 rounded-lg p-10 text-center hover:border-primary transition-colors duration-300">
              <Label htmlFor="pdf-upload" className="cursor-pointer block w-full h-full">
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Upload className="h-10 w-10 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Haz clic para subir el PDF de Cierre
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF con formato estándar de cierre de caja
                    </p>
                  </div>
                </div>
              </Label>
              <Input
                id="pdf-upload"
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isProcessing}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PDFUploadModal;
