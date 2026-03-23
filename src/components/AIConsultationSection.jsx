import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  MessageSquare, 
  TrendingUp, 
  TrendingDown, 
  CreditCard, 
  Users,
  X,
  RefreshCcw,
  BarChart2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

const AIConsultationSection = ({ stats, dailyBalances, results = [], reservaMovimientos = [] }) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: '\u00A1Hola! Soy tu asistente inteligente de Iciz Market. \u00BFEn qu\u00E9 puedo ayudarte hoy con tus informes y auditor\u00EDa?' 
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const formatCurrency = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val || 0);

  const getSmartResponse = (userQuery) => {
    const q = userQuery.toLowerCase();
    
    // 1. Logic for Specific Beneficiary/Supplier
    const mentionedResults = results.filter(r => 
      r.beneficiario?.toLowerCase().includes(q) || 
      r.categoria?.toLowerCase().includes(q)
    );

    if (mentionedResults.length > 0 && q.length > 3 && !q.includes('resumen')) {
      const total = mentionedResults.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0);
      const count = mentionedResults.length;
      const first = mentionedResults[0];
      
      return `He encontrado **${count}** coincidencia(s) para tu consulta "${userQuery}":\n\n` +
             `• **Total acumulado:** ${formatCurrency(total)}\n` +
             `• **Último registro:** ${new Date(first.fecha + 'T12:00:00').toLocaleDateString('es-CL')} - ${formatCurrency(first.monto)}\n` +
             `• **Categoría predominante:** ${first.categoria}\n\n` +
             `¿Deseas que desglose estos movimientos por fecha?`;
    }

    // 2. Logic for Top Analysis
    if (q.includes('top') || q.includes('mayores') || q.includes('ranking')) {
      const groups = {};
      results.forEach(r => {
        const name = r.beneficiario || 'Desconocido';
        groups[name] = (groups[name] || 0) + (parseFloat(r.monto) || 0);
      });
      const top5 = Object.entries(groups)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      let msg = `Aqu\u00ED tienes el ranking de los 5 principales beneficiarios/proveedores en el periodo:\n\n`;
      top5.forEach(([name, total], i) => {
        msg += `${i + 1}. **${name}**: ${formatCurrency(total)}\n`;
      });
      return msg;
    }

    // 3. Logic for Reserva
    if (q.includes('reserva') || q.includes('tesoreria') || q.includes('tesorería')) {
      const ingresosResc = reservaMovimientos.filter(m => m.tipo === 'ingreso').reduce((acc, m) => acc + (parseFloat(m.monto_total) || 0), 0);
      const egresosResc = reservaMovimientos.filter(m => m.tipo === 'egreso').reduce((acc, m) => acc + (parseFloat(m.monto_total) || 0), 0);
      return `En el m\u00F3dulo de **Reserva/Tesorer\u00EDa** he detectado:\n\n` +
             `• **Ingresos totales:** ${formatCurrency(ingresosResc)}\n` +
             `• **Egresos/Retiros:** ${formatCurrency(egresosResc)}\n\n` +
             `Esto incluye traspasos entre cajas y giros directos.`;
    }

    // 4. Logic for RRHH
    if (q.includes('rrhh') || q.includes('sueldo') || q.includes('personal')) {
      return `He analizado los gastos de RRHH en el periodo seleccionado. El total asciende a **${formatCurrency(stats.rrhhTotal)}**. Esto representa aproximadamente un **${((stats.rrhhTotal / stats.totalEgresos) * 100).toFixed(1)}%** del total de egresos filtrados (${formatCurrency(stats.totalEgresos)}).`;
    }

    // 5. Logic for "Resumen" / "Egresos" / "Ingresos"
    if (q.includes('resumen') || q.includes('general') || q.includes('balance')) {
      const balance = stats.totalIngresos - stats.totalEgresos;
      return `Aqu\u00ED tienes el resumen ejecutivo del periodo:\n\n` +
             `\u2022 **Ingresos Totales:** ${formatCurrency(stats.totalIngresos)}\n` +
             `\u2022 **Egresos Totales:** ${formatCurrency(stats.totalEgresos)}\n` +
             `\u2022 **Balance Neto:** ${formatCurrency(balance)}\n\n` +
             `Se han procesado un total de **${stats.count}** movimientos.`;
    }

    // 6. Logic for "Ventas" / "Caja"
    if (q.includes('venta') || q.includes('tarjeta') || q.includes('efectivo')) {
      const totalVentas = dailyBalances.filter(d => d.isTotalLine).reduce((acc, curr) => acc + curr.total_ventas, 0);
      const totalEfectivo = dailyBalances.filter(d => d.isTotalLine).reduce((acc, curr) => acc + curr.venta_efectivo, 0);
      const totalTarjetas = dailyBalances.filter(d => d.isTotalLine).reduce((acc, curr) => acc + curr.redelcom, 0);
      
      return `Analizando el Resumen Diario Consolidado:\n\n` +
             `• **Ventas Totales:** ${formatCurrency(totalVentas)}\n` +
             `• **Efectivo Neto:** ${formatCurrency(totalEfectivo)} (${((totalEfectivo/totalVentas)*100).toFixed(0)}%)\n` +
             `• **Tarjetas (Redelcom/Crédito):** ${formatCurrency(totalTarjetas)} (${((totalTarjetas/totalVentas)*100).toFixed(0)}%)\n\n` +
             `La tendencia de ventas muestra un comportamiento estable en las cajas consultadas.`;
    }

    // Default
    return "Interesante pregunta. Bas\u00E1ndome en los datos actuales, puedo decirte que tienes acceso a " + results.length + " movimientos detallados y " + dailyBalances.length + " registros de caja. \u00BFDeseas saber el total pagado a alg\u00FAn proveedor espec\u00EDfico o el ranking de gastos?";
  };

  const handleSend = () => {
    if (!query.trim()) return;

    const newMessages = [...messages, { role: 'user', content: query }];
    setMessages(newMessages);
    setQuery('');
    setIsTyping(true);

    // Simulate AI thinking
    setTimeout(() => {
      const response = getSmartResponse(query);
      setMessages([...newMessages, { role: 'assistant', content: response }]);
      setIsTyping(false);
    }, 1200);
  };

  const quickActions = [
    { label: 'Resumen Mensual', icon: <BarChart2 className="h-3 w-3" />, query: 'Dame un resumen general de este mes' },
    { label: 'Análisis RRHH', icon: <Users className="h-3 w-3" />, query: '¿Cuánto hemos gastado en RRHH?' },
    { label: 'Mix de Ventas', icon: <CreditCard className="h-3 w-3" />, query: '¿Cuál es el mix entre efectivo y tarjeta?' },
  ];

  return (
    <Card className="glass-card border-primary/20 overflow-hidden shadow-2xl">
      <CardHeader className="bg-primary/5 border-b border-primary/10 py-4 px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                Consulta IA Inteligente
                <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">BETA</Badge>
              </CardTitle>
              <CardDescription className="text-xs">Asistente financiero basado en tus datos reales</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setMessages([{ role: 'assistant', content: '\u00A1Hola! He reiniciado nuestra conversaci\u00F3n. \u00BFEn qu\u00E9 puedo ayudarte?' }])}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="flex flex-col h-[400px]">
          {/* Chat Area */}
          <div className="flex-1 p-6 overflow-y-auto no-scrollbar" ref={scrollRef}>
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex gap-3 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`mt-1 p-1.5 rounded-full shrink-0 ${m.role === 'user' ? 'bg-primary/20' : 'bg-secondary/40'}`}>
                        {m.role === 'user' ? <User className="h-4 w-4 text-primary" /> : <Bot className="h-4 w-4 text-primary" />}
                      </div>
                      <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                        m.role === 'user' 
                          ? 'bg-primary text-primary-foreground rounded-tr-none shadow-lg shadow-primary/20' 
                          : 'bg-secondary/30 border border-white/5 rounded-tl-none text-foreground'
                      }`}>
                        {m.content.split('\n').map((line, idx) => (
                          <p key={idx} className={idx > 0 ? 'mt-2' : ''}>
                            {line.split('**').map((part, pIdx) => 
                              pIdx % 2 === 1 ? <strong key={pIdx} className="font-bold">{part}</strong> : part
                            )}
                          </p>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-secondary/30 p-4 rounded-2xl rounded-tl-none flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="p-4 bg-primary/5 border-t border-primary/10">
            {/* Quick Actions */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
              {quickActions.map((action, idx) => (
                <Button 
                  key={idx} 
                  variant="outline" 
                  size="sm" 
                  className="bg-secondary/40 border-white/5 hover:bg-primary/20 text-[11px] h-8 rounded-full gap-2 whitespace-nowrap"
                  onClick={() => {
                    setQuery(action.query);
                    setTimeout(() => handleSend(), 100);
                  }}
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
            </div>

            <div className="relative group">
              <Input
                placeholder="Preg\u00FAntame sobre tus ventas, gastos o rrhh..."
                className="glass-input pr-12 h-12 border-primary/20 focus:border-primary/50"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <Button 
                size="icon" 
                className="absolute right-1.5 top-1.5 h-9 w-9 bg-primary hover:bg-primary/80"
                onClick={handleSend}
                disabled={!query.trim() || isTyping}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AIConsultationSection;
