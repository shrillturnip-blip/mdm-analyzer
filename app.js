/**
 * MDM Analyzer Dashboard - Application Logic
 * 
 * Powered by Firebase Firestore for real-time synchronization.
 * (Using Compat mode for local file:// support)
 */

const firebaseConfig = {
    apiKey: "AIzaSyBk0mRznRqmCNF7GM3wuLHjZjdNIGAt0EE",
    authDomain: "mdm-analyzer.firebaseapp.com",
    projectId: "mdm-analyzer",
    storageBucket: "mdm-analyzer.firebasestorage.app",
    messagingSenderId: "962195217922",
    appId: "1:962195217922:web:7e4ccb1f8909d5dd65111b"
};

// Initialize Firebase (Compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const recordsCol = db.collection("mdm_records");

let currentRecords = [];

// --- Data Service (Firebase Compat) ---
const StorageService = {
    initRealtime: function (callback) {
        // Listen to changes in real-time
        recordsCol.onSnapshot((snapshot) => {
            currentRecords = snapshot.docs.map(doc => {
                const data = doc.data();
                // Ensure date is a JS Date object for easier handling
                const date = data.date && typeof data.date.toDate === 'function'
                    ? data.date.toDate()
                    : new Date(data.date);

                return {
                    id: doc.id,
                    ...data,
                    date: date
                };
            });
            // Sort by date descending (newest first)
            currentRecords.sort((a, b) => b.date - a.date);
            if (callback) callback();
        }, (error) => {
            console.error("Erro no listener do Firestore:", error);
            alert("Erro de conexão com o banco de dados. Verifique as permissões.");
        });
    },

    getRecords: function () {
        return currentRecords;
    },

    saveRecord: async function (record) {
        try {
            // Remove local ID, Firestore will generate one
            delete record.id;
            await recordsCol.add(record);
        } catch (e) {
            console.error("Error adding document: ", e);
            alert("Erro ao salvar o registro no servidor.");
        }
    },

    deleteRecord: async function (id) {
        try {
            await recordsCol.doc(id).delete();
        } catch (e) {
            console.error("Error deleting document: ", e);
            alert("Erro ao deletar o registro.");
        }
    },

    deleteRecordsByDate: async function (dateStr) {
        try {
            const allSnapshot = await recordsCol.get();
            const batch = db.batch();
            let count = 0;

            allSnapshot.forEach(doc => {
                const data = doc.data();
                let matches = false;

                // Handle both Timestamp objects and ISO strings
                if (data.date && typeof data.date.toDate === 'function') {
                    const d = data.date.toDate();
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    if (`${year}-${month}-${day}` === dateStr) matches = true;
                } else if (typeof data.date === 'string' && data.date.startsWith(dateStr)) {
                    matches = true;
                }

                if (matches) {
                    batch.delete(doc.ref);
                    count++;
                }
            });

            if (count === 0) {
                alert("Nenhum registro encontrado para esta data.");
                return;
            }

            await batch.commit();
            alert(`${count} registros apagados com sucesso!`);
        } catch (e) {
            console.error("Error deleting documents: ", e);
            alert("Erro ao deletar registros. Verifique suas permissões no Firebase Rules.");
        }
    }
};

// --- DOM Elements ---
const DOM = {
    // Nav
    navLinks: document.querySelectorAll('.nav-links li'),
    views: document.querySelectorAll('.view-section'),

    // Form
    form: document.getElementById('mdm-form'),
    radioYes: document.querySelector('input[value="yes"]'),
    radioNo: document.querySelector('input[value="no"]'),
    reasonContainer: document.getElementById('reason-container'),
    reasonSelect: document.getElementById('failure-reason'),
    notification: document.getElementById('success-notification'),
    btnNewRecord: document.getElementById('btn-new-record'),

    // Dashboard Stats
    statTotal: document.getElementById('stat-total'),
    statInstalled: document.getElementById('stat-installed'),
    statNotInstalled: document.getElementById('stat-not-installed'),
    goalTag: document.getElementById('goal-tag'),
    goalText: document.getElementById('goal-text'),

    // Dashboard Table & Filters
    tableBody: document.getElementById('records-body'),
    emptyState: document.getElementById('empty-state'),
    filterDateStart: document.getElementById('filter-date-start'),
    filterDateEnd: document.getElementById('filter-date-end'),
    filterUser: document.getElementById('filter-user'),
    filterStatus: document.getElementById('filter-status'),
    btnClearFilters: document.getElementById('clear-filters'),
    btnClearDay: document.getElementById('clear-day-data'),

    // Logo (Admin Trigger)
    brandLogo: document.getElementById('brand-logo'),

    // Charts
    ctxStatus: document.getElementById('statusChart').getContext('2d'),
    ctxReasons: document.getElementById('reasonsChart').getContext('2d'),

    // Datalist
    agentDatalist: document.getElementById('agent-list'),

    // Theme Toggle
    themeToggle: document.getElementById('theme-toggle'),

    // Ranking
    podiumContainer: document.getElementById('ranking-podium'),
    rankingBody: document.getElementById('ranking-body')
};

// --- Chart Instances ---
let statusChartInstance = null;
let reasonsChartInstance = null;

// Global Chart settings
Chart.defaults.color = '#A0A0B0';
Chart.defaults.font.family = "'Inter', sans-serif";

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initFormLogic();
    initThemeLogic();
    initFilters(); // Initialize date filters with current date

    // Connect to Firebase and update dashboard when data arrives
    StorageService.initRealtime(() => {
        updateDashboard();
    });
});

// --- Navigation Logic ---
function initNavigation() {
    DOM.navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Remove active from all
            DOM.navLinks.forEach(l => l.classList.remove('active'));
            DOM.views.forEach(v => v.classList.remove('active', 'hidden'));
            DOM.views.forEach(v => v.classList.add('hidden'));

            // Add active to clicked
            link.classList.add('active');
            const targetView = document.getElementById(link.dataset.tab);
            targetView.classList.remove('hidden');
            targetView.classList.add('active');

            // Refresh dashboard when switching to it
            if (link.dataset.tab === 'dashboard') {
                updateDashboard();
            }
            if (link.dataset.tab === 'ranking') {
                updateRanking();
            }
        });
    });
}

// --- Form Logic ---
function initFormLogic() {
    // Show/Hide Reason
    const radios = document.querySelectorAll('input[name="mdm-status"]');
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'no') {
                DOM.reasonContainer.classList.remove('hidden');
                DOM.reasonSelect.setAttribute('required', 'true');
            } else {
                DOM.reasonContainer.classList.add('hidden');
                DOM.reasonSelect.removeAttribute('required');
                DOM.reasonSelect.value = '';
            }
        });
    });

    // Handle Submit
    DOM.form.addEventListener('submit', (e) => {
        e.preventDefault();

        const recordId = document.getElementById('record-id').value.trim();
        const agentName = document.getElementById('agent-name').value.trim();
        const clientName = document.getElementById('client-name').value.trim();
        const isInstalled = document.querySelector('input[name="mdm-status"]:checked').value === 'yes';
        const reason = isInstalled ? null : DOM.reasonSelect.value;

        // Get current date and time in local format (ISO-like but local)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const timePart = now.toTimeString().split(' ')[0]; // HH:MM:SS
        const dateString = `${year}-${month}-${day}T${timePart}`;

        // Save with native Date object (Firestore converts this to Timestamp automatically)
        // Save with native Firestore Timestamp object
        const newRecord = {
            recordNumber: recordId,
            agentName: agentName,
            clientName: clientName,
            installed: isInstalled,
            reason: reason,
            date: firebase.firestore.Timestamp.now()
        };

        StorageService.saveRecord(newRecord);

        // Show Success Overlay
        DOM.notification.classList.remove('hidden');

        // updateDashboard() is no longer needed here because onSnapshot will trigger it automatically
    });

    // Handle New Record Button
    DOM.btnNewRecord.addEventListener('click', () => {
        DOM.form.reset();
        DOM.reasonContainer.classList.add('hidden');
        DOM.notification.classList.add('hidden');
    });
}

// --- Dashboard Logic ---

function initFilters() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    if (DOM.filterDateStart) DOM.filterDateStart.value = todayStr;
    if (DOM.filterDateEnd) DOM.filterDateEnd.value = todayStr;
}

// Listen to filter changes
DOM.filterDateStart.addEventListener('change', updateDashboard);
DOM.filterDateEnd.addEventListener('change', updateDashboard);
DOM.filterUser.addEventListener('change', updateDashboard);
DOM.filterStatus.addEventListener('change', updateDashboard);

DOM.btnClearFilters.addEventListener('click', () => {
    DOM.filterDateStart.value = '';
    DOM.filterDateEnd.value = '';
    DOM.filterUser.value = 'all';
    DOM.filterStatus.value = 'all';
    updateDashboard();
});

// Admin Mode Logic
let adminClickCount = 0;
let adminClickTimer = null;

DOM.brandLogo.addEventListener('click', () => {
    adminClickCount++;
    clearTimeout(adminClickTimer);

    adminClickTimer = setTimeout(() => {
        adminClickCount = 0;
    }, 2000); // reset if 2 seconds pass without a click

    if (adminClickCount >= 10) {
        document.body.classList.toggle('admin-mode');
        adminClickCount = 0; // reset
        if (document.body.classList.contains('admin-mode')) {
            alert('Modo Admin Ativado!');
        } else {
            alert('Modo Admin Desativado!');
        }
    }
});

// Clear Day Data Logic
DOM.btnClearDay.addEventListener('click', async () => {
    const selectedDate = DOM.filterDateStart.value;
    if (!selectedDate) {
        alert('Por favor, selecione pelo menos a Data Inicial no filtro para identificar o dia a ser apagado.');
        return;
    }

    // Format date for better readability in confirmation
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('pt-BR');

    if (confirm(`Modo Admin: Tem certeza que deseja apagar TODOS os registros realizados no dia ${formattedDate}?\nEsta ação não pode ser desfeita!`)) {
        await StorageService.deleteRecordsByDate(selectedDate);
        // updateDashboard() is not needed here; onSnapshot handles it
    }
});

// Theme Logic
function initThemeLogic() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        updateThemeUI('light');
    }

    DOM.themeToggle.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-mode');
        const newTheme = isLight ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        updateThemeUI(newTheme);

        // Update charts to reflect new theme colors
        updateDashboard();
    });
}

function updateThemeUI(theme) {
    const icon = DOM.themeToggle.querySelector('i');
    const span = DOM.themeToggle.querySelector('span');

    if (theme === 'light') {
        icon.className = 'fa-solid fa-sun';
        span.textContent = 'Modo Claro';
    } else {
        icon.className = 'fa-solid fa-moon';
        span.textContent = 'Modo Escuro';
    }

    // Update global chart defaults
    Chart.defaults.color = theme === 'light' ? '#64748B' : '#A0A0B0';
}

function getFilteredRecords() {
    const records = StorageService.getRecords();
    const startDateVal = DOM.filterDateStart.value;
    const endDateVal = DOM.filterDateEnd.value;
    const filterUserVal = DOM.filterUser.value;
    const filterStatusVal = DOM.filterStatus.value;

    return records.filter(record => {
        // Date Range Filter
        if (startDateVal || endDateVal) {
            // record.date should be a JS Date object from StorageService
            if (!(record.date instanceof Date) || isNaN(record.date)) return false;

            const year = record.date.getFullYear();
            const month = String(record.date.getMonth() + 1).padStart(2, '0');
            const day = String(record.date.getDate()).padStart(2, '0');
            const recordLocalDate = `${year}-${month}-${day}`;

            if (startDateVal && recordLocalDate < startDateVal) return false;
            if (endDateVal && recordLocalDate > endDateVal) return false;
        }
        if (filterUserVal !== 'all' && record.agentName !== filterUserVal) {
            return false;
        }
        if (filterStatusVal !== 'all') {
            const isInstalledFilter = filterStatusVal === 'installed';
            if (record.installed !== isInstalledFilter) return false;
        }
        return true;
    });
}

function updateDashboard() {
    // Filter records for stats and charts, but keep all for Agent Filter Dropdown
    const allRecords = StorageService.getRecords();
    const filteredRecords = getFilteredRecords();

    // Update Stats based on filtered records
    const total = filteredRecords.length;
    const installed = filteredRecords.filter(r => r.installed).length;
    const alreadyInstalled = filteredRecords.filter(r => !r.installed && r.reason === 'Já instalado').length;
    const notInstalled = total - installed; // Total not installed (includes 'Já instalado')
    const failed = notInstalled - alreadyInstalled; // Strictly errors/unreachable

    // Goal Calculation (60%)
    updateGoalStatus(installed, alreadyInstalled, total);

    // Animate numbers (simple version)
    DOM.statTotal.textContent = total;
    DOM.statInstalled.textContent = installed;
    DOM.statNotInstalled.textContent = notInstalled;

    // Update Filter Options (Agents) based on ALL records
    updateAgentFilterOptions(allRecords);

    // Render Charts
    renderCharts(installed, alreadyInstalled, failed, total, filteredRecords);

    // Render Table
    renderTable(filteredRecords);
}

function updateGoalStatus(installed, alreadyInstalled, total) {
    if (total === 0) {
        DOM.goalTag.classList.add('hidden');
        return;
    }

    DOM.goalTag.classList.remove('hidden');
    const successRate = (installed + alreadyInstalled) / total;
    const isWithinGoal = successRate >= 0.6;

    DOM.goalTag.classList.remove('within-goal', 'below-goal');
    
    if (isWithinGoal) {
        DOM.goalTag.classList.add('within-goal');
        DOM.goalText.textContent = `Dentro da Meta (${Math.round(successRate * 100)}%)`;
    } else {
        DOM.goalTag.classList.add('below-goal');
        DOM.goalText.textContent = `Fora da Meta (${Math.round(successRate * 100)}%)`;
    }
}

function renderCharts(installed, alreadyInstalled, failed, total, records) {
    // Colors from CSS
    const clrSuccess = '#00E676';
    const clrDanger = '#FF4C4C';
    const clrPrimary = '#8A2BE2';
    const clrAccent = '#FFD700';

    // Get neutral color from CSS variable to adapt to theme
    const clrNeutral = getComputedStyle(document.body).getPropertyValue('--clr-text-muted').trim() || '#A0A0B0';

    // Calculate Percentages for labels
    const pInstalado = total > 0 ? Math.round((installed / total) * 100) : 0;
    const pJaInstalado = total > 0 ? Math.round((alreadyInstalled / total) * 100) : 0;
    const pFalha = total > 0 ? Math.round((failed / total) * 100) : 0;

    // 1. Status Doughnut Chart
    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    statusChartInstance = new Chart(DOM.ctxStatus, {
        type: 'pie',
        data: {
            labels: [
                `Instalado (${pInstalado}%)`,
                `Já Instalado (${pJaInstalado}%)`,
                `Falha (${pFalha}%)`
            ],
            datasets: [{
                data: [installed, alreadyInstalled, failed],
                backgroundColor: [clrSuccess, clrNeutral, clrDanger],
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: { size: 12, weight: '500' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function (context) {
                            return ` ${context.label}: ${context.parsed} dispositivos`;
                        }
                    }
                }
            }
        }
    });

    // 2. Reasons Bar Chart
    if (reasonsChartInstance) {
        reasonsChartInstance.destroy();
    }

    const failedRecords = records.filter(r => !r.installed && r.reason);
    const reasonCounts = {};
    failedRecords.forEach(r => {
        reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
    });

    const reasonLabels = Object.keys(reasonCounts);
    const reasonData = Object.values(reasonCounts);

    // Add percentage to reason labels
    const totalReasons = reasonData.reduce((a, b) => a + b, 0);
    const reasonLabelsWithPercent = reasonLabels.map(label => {
        const value = reasonCounts[label];
        const percent = totalReasons > 0 ? Math.round((value / totalReasons) * 100) : 0;
        return `${label} (${percent}%)`;
    });

    // Determine colors for each bar
    const bgColors = reasonLabels.map(label => {
        return label === 'Já instalado' ? '#A0A0B0' : clrPrimary;
    });

    reasonsChartInstance = new Chart(DOM.ctxReasons, {
        type: 'bar',
        data: {
            labels: reasonLabelsWithPercent.length > 0 ? reasonLabelsWithPercent : ['Nenhum dado'],
            datasets: [{
                label: 'Ocorrências',
                data: reasonData.length > 0 ? reasonData : [0],
                backgroundColor: bgColors.length > 0 ? bgColors : clrPrimary,
                borderRadius: 6,
                borderWidth: 0,
                barThickness: 25
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bars for better readability
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            const val = context.parsed.x;
                            const total = reasonData.reduce((a, b) => a + b, 0);
                            const perc = total > 0 ? Math.round((val / total) * 100) : 0;
                            return ` Ocorrências: ${val} (${perc}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { 
                        stepSize: 1,
                        font: { size: 11 }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 12, weight: '500' }
                    }
                }
            }
        }
    });
}

function updateAgentFilterOptions(records) {
    // Get unique agents
    const agents = [...new Set(records.map(r => r.agentName))].sort();
    const currentSelection = DOM.filterUser.value;

    let optionsHTML = '<option value="all">Todos os Técnicos</option>';
    let datalistHTML = '';

    agents.forEach(agent => {
        optionsHTML += `<option value="${agent}">${agent}</option>`;
        datalistHTML += `<option value="${agent}">`;
    });

    DOM.filterUser.innerHTML = optionsHTML;

    if (DOM.agentDatalist) {
        DOM.agentDatalist.innerHTML = datalistHTML;
    }

    // Restore selection if it still exists
    if (agents.includes(currentSelection)) {
        DOM.filterUser.value = currentSelection;
    }
}

function renderTable(filteredRecords) {
    // Build DOM
    DOM.tableBody.innerHTML = '';

    if (!filteredRecords || filteredRecords.length === 0) {
        DOM.emptyState.classList.remove('hidden');
        DOM.tableBody.parentElement.classList.add('hidden');
    } else {
        DOM.emptyState.classList.add('hidden');
        DOM.tableBody.parentElement.classList.remove('hidden');

        filteredRecords.forEach(record => {
            // record.date is already a JS Date object thanks to initRealtime mapping
            const dateStr = record.date.toLocaleDateString('pt-BR') + ' ' + record.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const statusBadge = record.installed
                ? `<span class="status-badge installed"><i class="fa-solid fa-check"></i> Instalado</span>`
                : `<span class="status-badge not-installed"><i class="fa-solid fa-xmark"></i> Falha</span>`;

            const reasonText = record.reason ? record.reason : '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td><strong>${record.recordNumber}</strong></td>
                <td>${record.clientName}</td>
                <td>${record.agentName}</td>
                <td>${statusBadge}</td>
                <td>${reasonText}</td>
                <td class="admin-only">
                    <button class="delete-btn" onclick="deleteRecord('${record.id}')" title="Excluir Registro">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            DOM.tableBody.appendChild(tr);
        });
    }
}

// Global function for onclick event (needs to be exposed to window since we are in a module)
window.deleteRecord = function (id) {
    if (confirm('Tem certeza que deseja excluir este registro?')) {
        StorageService.deleteRecord(id);
        // updateDashboard() is not needed here; onSnapshot handles it
    }
};
// --- Ranking Logic ---
function updateRanking() {
    const allRecords = StorageService.getRecords();
    if (!allRecords || allRecords.length === 0) {
        DOM.podiumContainer.innerHTML = '<p class="empty-state">Nenhum dado disponível para o ranking.</p>';
        DOM.rankingBody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum dado disponível.</td></tr>';
        return;
    }

    // Calculate stats per agent
    const agentStats = {};
    allRecords.forEach(record => {
        const agent = record.agentName;
        if (!agentStats[agent]) {
            agentStats[agent] = { name: agent, total: 0, installed: 0 };
        }

        // EXCLUDE "Já instalado" from both total and installed counts for ranking purposes
        if (!record.installed && record.reason === 'Já instalado') {
            return; // Ignore this record for ranking
        }

        agentStats[agent].total++;
        if (record.installed) {
            agentStats[agent].installed++;
        }
    });

    // Convert to array and calculate rates
    const rankingArray = Object.values(agentStats).map(stat => {
        const rate = stat.total > 0 ? (stat.installed / stat.total) : 0;
        return {
            ...stat,
            rate: rate,
            percentage: Math.round(rate * 100)
        };
    });

    // Sort by rate descending, then by total calls descending (tie-breaker)
    rankingArray.sort((a, b) => {
        if (b.rate !== a.rate) return b.rate - a.rate;
        return b.total - a.total;
    });

    renderRanking(rankingArray);
}

function renderRanking(rankingArray) {
    // 1. Render Podium (Top 3)
    const podiumData = rankingArray.slice(0, 3);
    // Order for podium display: 2nd, 1st, 3rd
    const displayOrder = [];
    if (podiumData.length >= 2) displayOrder.push({ ...podiumData[1], rank: 2 });
    if (podiumData.length >= 1) displayOrder.push({ ...podiumData[0], rank: 1 });
    if (podiumData.length >= 3) displayOrder.push({ ...podiumData[2], rank: 3 });

    DOM.podiumContainer.innerHTML = '';
    displayOrder.forEach(item => {
        const icon = item.rank === 1 ? 'fa-crown' : 'fa-user';
        const podiumItem = document.createElement('div');
        podiumItem.className = `podium-item rank-${item.rank}`;
        podiumItem.innerHTML = `
            <div class="podium-rank">${item.rank === 1 ? '<i class="fa-solid fa-star"></i>' : item.rank}</div>
            <div class="podium-card">
                <div class="podium-avatar">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div class="podium-name">${item.name}</div>
                <div class="podium-stats">
                    <span class="podium-percentage">${item.percentage}%</span>
                    <span class="podium-subtext">${item.installed} / ${item.total} instalados</span>
                </div>
            </div>
        `;
        DOM.podiumContainer.appendChild(podiumItem);
    });

    // 2. Render Full List Table
    DOM.rankingBody.innerHTML = '';
    rankingArray.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${index + 1}</td>
            <td><strong>${item.name}</strong></td>
            <td>${item.installed}</td>
            <td>${item.total}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="width: 40px; font-weight: 600;">${item.percentage}%</span>
                    <div class="efficiency-bar-container">
                        <div class="efficiency-bar" style="width: ${item.percentage}%"></div>
                    </div>
                </div>
            </td>
        `;
        DOM.rankingBody.appendChild(tr);
    });
}
