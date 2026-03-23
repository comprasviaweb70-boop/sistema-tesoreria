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

  // Helper to parse date ranges from query
  const parseDateRange = (q) => {
    const now = new Date();
    let start = null;
    let end = new Date();

    if (q.includes('hoy')) {
      start = new Date(now.setHours(0,0,0,0));
    } else if (q.includes('ayer')) {
      start = new Date(now.setDate(now.getDate() - 1));
      start.setHours(0,0,0,0);
      end = new Date(start);
      end.setHours(23,59,59,999);
    } else if (q.includes('esta semana')) {
      const day = now.getDay() || 7;
      start = new Date(now.setHours(0,0,0,0));
      start.setDate(now.getDate() - day + 1);
    } else if (q.includes('mes pasado')) {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (q.includes('este mes')) {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      // Regex for "X dias"
      const daysMatch = q.match(/(\d+)\s+d\u00EDas/);
      if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        start = new Date(now.setDate(now.getDate() - days));
      }
    }
    return { start, end };
  };

  const getSmartResponse = (userQuery) => {
    const q = userQuery.toLowerCase();
    const { start, end } = parseDateRange(q);
    
    // Filter results by date if range identified
    let filteredResults = results;
    let periodText = "";
    if (start) {
      filteredResults = results.filter(r => {
        const d = new Date(r.fecha + 'T12:00:00');
        return d >= start && d <= end;
      });
      periodText = ` en el periodo del ${start.toLocaleDateString('es-CL')} al ${end.toLocaleDateString('es-CL')}`;
    }

    // Identify Subject (Supplier or Category)
    // We search for the longest match in results to be accurate
    let bestMatch = null;
    let maxMatchLen = 0;
    
    // Check beneficiaries
    results.forEach(r => {
      const name = r.beneficiario?.toLowerCase();
      if (name && name.length > 3 && q.includes(name) && name.length > maxMatchLen) {
        bestMatch = { type: 'beneficiary', name: r.beneficiario };
        maxMatchLen = name.length;
      }
    });

    // Check categories if no beneficiary found or specific word used
    if (!bestMatch || q.includes('categor\u00EDa')) {
      results.forEach(r => {
        const cat = r.categoria?.toLowerCase();
        if (cat && cat.length > 3 && q.includes(cat) && cat.length > maxMatchLen) {
          bestMatch = { type: 'category', name: r.categoria };
          maxMatchLen = cat.length;
        }
      });
    }

    if (bestMatch) {
      const targetResults = filteredResults.filter(r => 
        (bestMatch.type === 'beneficiary' && r.beneficiario === bestMatch.name) ||
        (bestMatch.type === 'category' && r.categoria === bestMatch.name)
      );

      if (targetResults.length > 0) {
        const total = targetResults.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0);
        return `He analizado los registros de **${bestMatch.name}**${periodText}.\n\n` +
               `\u2022 **Monto Total:** ${formatCurrency(total)}\n` +
               `\u2022 **Cantidad de movimientos:** ${targetResults.length}\n` +
               `\u2022 **Promedio:** ${formatCurrency(total / targetResults.length)}\n\n` +
               `¿Te gustaría ver el detalle de estos movimientos?`;
      } else if (start) {
        return `No encontr\u00E9 movimientos para **${bestMatch.name}** en ese periodo espec\u00EDfico, aunque s\u00ED existen registros en otras fechas.`;
      }
    }

    // 2. Logic for Top Analysis
    if (q.includes('top') || q.includes('mayores') || q.includes('ranking')) {
      const groups = {};
      filteredResults.forEach(r => {
        const name = r.beneficiario || 'Desconocido';
        groups[name] = (groups[name] || 0) + (parseFloat(r.monto) || 0);
      });
      const top5 = Object.entries(groups)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      let msg = `Aqu\u00ED tienes el ranking de los 5 mayores gastos${periodText}:\n\n`;
      top5.forEach(([name, total], i) => {
        msg += `${i + 1}. **${name}**: ${formatCurrency(total)}\n`;
      });
      return msg;
    }

    // 3. Logic for Reserva
    if (q.includes('reserva') || q.includes('tesoreria') || q.includes('tesorería')) {
      const filteredReserva = start ? reservaMovimientos.filter(m => {
        const d = new Date(m.fecha + 'T12:00:00');
        return d >= start && d <= end;
      }) : reservaMovimientos;

      const ingresosResc = filteredReserva.filter(m => m.tipo === 'ingreso').reduce((acc, m) => acc + (parseFloat(m.monto_total) || 0), 0);
      const egresosResc = filteredReserva.filter(m => m.tipo === 'egreso').reduce((acc, m) => acc + (parseFloat(m.monto_total) || 0), 0);
      
      return `En el m\u00F3dulo de **Reserva/Tesorer\u00EDa**${periodText} he detectado:\n\n` +
             `\u2022 **Ingresos totales:** ${formatCurrency(ingresosResc)}\n` +
             `\u2022 **Egresos/Retiros:** ${formatCurrency(egresosResc)}`;
    }

    // 4. RRHH Logic (using stats if no period, or results if period)
    if (q.includes('rrhh') || q.includes('sueldo') || q.includes('personal')) {
      const rrhhResults = filteredResults.filter(r => r.categoria?.toLowerCase().includes('rrhh'));
      const total = rrhhResults.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0);
      return `Los gastos de **RRHH**${periodText} suman un total de **${formatCurrency(start ? total : stats.rrhhTotal)}**.`;
    }

    // 5. Logic for "Resumen"
    if (q.includes('resumen') || q.includes('general') || q.includes('balance')) {
      const ing = filteredResults.filter(r => r.tipo === 'ingreso').reduce((acc, r) => acc + (parseFloat(r.monto) || 0), 0);
      const egr = filteredResults.filter(r => r.tipo === 'egreso').reduce((acc, r) => acc + (parseFloat(r.monto) || 0), 0);
      
      return `Resumen ejecutivo${periodText}:\n\n` +
             `\u2022 **Ingresos:** ${formatCurrency(start ? ing : stats.totalIngresos)}\n` +
             `\u2022 **Egresos:** ${formatCurrency(start ? egr : stats.totalEgresos)}\n` +
             `\u2022 **Balance:** ${formatCurrency((start ? ing : stats.totalIngresos) - (start ? egr : stats.totalEgresos))}`;
    }

    // 6. Logic for "Ventas"
    if (q.includes('venta') || q.includes('tarjeta') || q.includes('efectivo')) {
      let fBalances = dailyBalances;
      if (start) {
        fBalances = dailyBalances.filter(d => {
          const dt = new Date(d.fecha + 'T12:00:00');
          return dt >= start && dt <= end;
        });
      }
      
      const totalVentas = fBalances.filter(d => d.isTotalLine).reduce((acc, curr) => acc + curr.total_ventas, 0);
      return `Ventas consolidadas${periodText}: **${formatCurrency(totalVentas)}**.`;
    }

    // Default
    return "Interesante pregunta. Puedes consultarme por **proveedores espec\u00EDficos**, **gastos de RRHH** o pedirme un **Top 5**, aclarando si lo deseas de 'esta semana', 'este mes' o 'los \u00FAltimos X d\u00EDas'.";
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
