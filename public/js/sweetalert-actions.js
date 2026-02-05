console.log('SweetAlert Actions Script Loaded');

/**
 * SweetAlert2 Action Confirmation Handler
 * Usage: onsubmit="return confirmAction(event, 'delete', 'Item Name')"
 * or: onclick="return confirmAction(event, 'block', 'User Name', 'href')" (for links)
 */
function confirmAction(event, actionType, itemName, context = 'form', confirmButtonText = null) {
    // DEBUG: Alert to confirm function entry
    // alert('confirmAction called for: ' + actionType); 

    // Stop immediate action
    if (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    console.log('confirmAction triggered:', { actionType, itemName, context });

    const target = event.target || event.currentTarget;
    const form = context === 'form' ? (target.form || target) : null;
    const link = context === 'link' ? target.href : null;

    // Define colors and texts based on action
    let confirmColor = '#3085d6'; // default blue
    let icon = 'warning';

    if (['delete', 'remove', 'destroy'].includes(actionType.toLowerCase())) {
        confirmColor = '#d33'; // red
    } else if (['block', 'ban'].includes(actionType.toLowerCase())) {
        confirmColor = '#d33'; // red
    } else if (['unblock', 'restore', 'activate'].includes(actionType.toLowerCase())) {
        confirmColor = '#28a745'; // green
    }

    if (!confirmButtonText) {
        confirmButtonText = 'Yes';
    }

    // fallback to native confirm if Swal is not defined
    if (typeof Swal === 'undefined') {
        if (confirm(`Are you sure you want to ${actionType.toUpperCase()} ${itemName}?`)) {
            if (context === 'form' && form) form.submit();
            if (context === 'link' && link) window.location.href = link;
            if (typeof context === 'function') context();
        }
        return false;
    }

    Swal.fire({
        title: 'Are you sure?',
        text: `You are about to ${actionType} ${itemName}.`,
        icon: icon,
        showCancelButton: true,
        confirmButtonColor: confirmColor,
        cancelButtonColor: '#6c757d',
        confirmButtonText: confirmButtonText,
        cancelButtonText: 'No'
    }).then((result) => {
        if (result.isConfirmed) {
            if (context === 'form' && form) {
                form.submit();
            } else if (context === 'link' && link) {
                window.location.href = link;
            } else if (context === 'href') {
                // If the element itself is the link (<a> tag)
                window.location.href = target.href;
            } else if (typeof context === 'function') {
                context();
            }
        }
    });

    return false;
}
