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
    initRealtime: function(callback) {
        // Listen to changes in real-time
        recordsCol.onSnapshot((snapshot) => {
            currentRecords = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort by date descending (newest first)
            currentRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
            if (callback) callback();
        }, (error) => {
            console.error("Erro no listener do Firestore:", error);
            alert("Erro de conexão com o banco de dados. Verifique as permissões.");
        });
    },

    getRecords: function() {
        return currentRecords;
    },

    saveRecord: async function(record) {
        try {
            // Remove local ID, Firestore will generate one
            delete record.id;
            await recordsCol.add(record);
        } catch (e) {
            console.error("Error adding document: ", e);
            alert("Erro ao salvar o registro no servidor.");
        }
    },

    deleteRecord: async function(id) {
        try {
            await recordsCol.doc(id).delete();
        } catch (e) {
            console.error("Error deleting document: ", e);
            alert("Erro ao deletar o registro.");
        }
    },

    deleteRecordsByDate: async function(dateStr) {
        try {
            const snapshot = await recordsCol.get();
            const deletePromises = [];
            snapshot.forEach(docSnap => {
                const rDate = docSnap.data().date.split('T')[0];
                if (rDate === dateStr) {
                    deletePromises.push(recordsCol.doc(docSnap.id).delete());
                }
            });
            await Promise.all(deletePromises);
        } catch (e) {
            console.error("Error deleting multiple documents: ", e);
            alert("Erro ao apagar registros.");
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
    
    // Dashboard Table & Filters
    tableBody: document.getElementById('records-body'),
    emptyState: document.getElementById('empty-state'),
    filterDate: document.getElementById('filter-date'),
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
    themeToggle: document.getElementById('theme-toggle')
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
            if(link.dataset.tab === 'dashboard') {
                updateDashboard();
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
        
        // Get current date automatically
        const now = new Date();
        const dateString = now.toISOString(); // Use ISO for easier filtering later

        const newRecord = {
            id: Date.now().toString(), // Unique internal ID
            recordNumber: recordId,
            agentName: agentName,
            clientName: clientName,
            installed: isInstalled,
            reason: reason,
            date: dateString
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

// Listen to filter changes
DOM.filterDate.addEventListener('change', updateDashboard);
DOM.filterUser.addEventListener('change', updateDashboard);
DOM.filterStatus.addEventListener('change', updateDashboard);

DOM.btnClearFilters.addEventListener('click', () => {
    DOM.filterDate.value = '';
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
        if(document.body.classList.contains('admin-mode')){
            alert('Modo Admin Ativado!');
        } else {
            alert('Modo Admin Desativado!');
        }
    }
});

// Clear Day Data Logic
DOM.btnClearDay.addEventListener('click', () => {
    const selectedDate = DOM.filterDate.value;
    if (!selectedDate) {
        alert('Por favor, selecione uma Data no filtro para apagar os dados daquele dia.');
        return;
    }
    
    // Format date for better readability in confirmation
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('pt-BR');

    if (confirm(`Modo Admin: Tem certeza que deseja apagar TODOS os registros realizados no dia ${formattedDate}?\nEsta ação não pode ser desfeita!`)) {
        StorageService.deleteRecordsByDate(selectedDate);
        // updateDashboard() is not needed here; onSnapshot handles it
        alert(`Comando de exclusão enviado. Aguarde a sincronização.`);
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
    const filterDateVal = DOM.filterDate.value;
    const filterUserVal = DOM.filterUser.value;
    const filterStatusVal = DOM.filterStatus.value;

    return records.filter(record => {
        if (filterDateVal) {
            const recordDate = record.date.split('T')[0];
            if (recordDate !== filterDateVal) return false;
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
        type: 'doughnut',
        data: {
            labels: [
                `Instalado (${pInstalado}%)`, 
                `Já Instalado (${pJaInstalado}%)`, 
                `Falha (${pFalha}%)`
            ],
            datasets: [{
                data: [installed, alreadyInstalled, failed],
                backgroundColor: [clrSuccess, clrNeutral, clrDanger],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${context.parsed}`;
                        }
                    }
                }
            },
            cutout: '70%'
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
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` Ocorrências: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                },
                x: {
                    ticks: {
                        display: false // Hide long labels on x axis, rely on tooltips
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
            const dateObj = new Date(record.date);
            const dateStr = dateObj.toLocaleDateString('pt-BR') + ' ' + dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            
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
window.deleteRecord = function(id) {
    if(confirm('Tem certeza que deseja excluir este registro?')) {
        StorageService.deleteRecord(id);
        // updateDashboard() is not needed here; onSnapshot handles it
    }
};
