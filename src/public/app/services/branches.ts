import utils from './utils.js';
import server from './server.js';
import toastService, { ToastOptions } from "./toast.js";
import froca from "./froca.js";
import hoistedNoteService from "./hoisted_note.js";
import ws from "./ws.js";
import appContext from "../components/app_context.js";
import { t } from './i18n.js';
import { Node } from './tree.js';
import { ResolveOptions } from '../widgets/dialogs/delete_notes.js';

// TODO: Deduplicate type with server
interface Response {
    success: boolean;
    message: string;
}

async function moveBeforeBranch(branchIdsToMove: string[], beforeBranchId: string) {
    branchIdsToMove = filterRootNote(branchIdsToMove);
    branchIdsToMove = filterSearchBranches(branchIdsToMove);

    const beforeBranch = froca.getBranch(beforeBranchId);
    if (!beforeBranch) {
        return;
    }

    if (['root', '_lbRoot', '_lbAvailableLaunchers', '_lbVisibleLaunchers', "_lbMobileRoot", "_lbMobileAvailableLaunchers", "_lbMobileVisibleLaunchers" ].includes(beforeBranch.noteId)) {
        toastService.showError(t("branches.cannot-move-notes-here"));
        return;
    }

    for (const branchIdToMove of branchIdsToMove) {
        const resp = await server.put<Response>(`branches/${branchIdToMove}/move-before/${beforeBranchId}`);

        if (!resp.success) {
            toastService.showError(resp.message);
            return;
        }
    }
}

async function moveAfterBranch(branchIdsToMove: string[], afterBranchId: string) {
    branchIdsToMove = filterRootNote(branchIdsToMove);
    branchIdsToMove = filterSearchBranches(branchIdsToMove);

    const afterNote = await froca.getBranch(afterBranchId)?.getNote();
    if (!afterNote) {
        return;
    }

    const forbiddenNoteIds = [
        'root',
        hoistedNoteService.getHoistedNoteId(),
        '_lbRoot',
        '_lbAvailableLaunchers',
        '_lbVisibleLaunchers'
    ];

    if (forbiddenNoteIds.includes(afterNote.noteId)) {
        toastService.showError(t("branches.cannot-move-notes-here"));
        return;
    }

    branchIdsToMove.reverse(); // need to reverse to keep the note order

    for (const branchIdToMove of branchIdsToMove) {
        const resp = await server.put<Response>(`branches/${branchIdToMove}/move-after/${afterBranchId}`);

        if (!resp.success) {
            toastService.showError(resp.message);
            return;
        }
    }
}

async function moveToParentNote(branchIdsToMove: string[], newParentBranchId: string) {
    const newParentBranch = froca.getBranch(newParentBranchId);
    if (!newParentBranch) {
        return;
    }

    if (newParentBranch.noteId === '_lbRoot') {
        toastService.showError(t("branches.cannot-move-notes-here"));
        return;
    }

    branchIdsToMove = filterRootNote(branchIdsToMove);

    for (const branchIdToMove of branchIdsToMove) {
        const branchToMove = froca.getBranch(branchIdToMove);

        if (!branchToMove
            || branchToMove.noteId === hoistedNoteService.getHoistedNoteId()
            || (await branchToMove.getParentNote())?.type === 'search') {
            continue;
        }

        const resp = await server.put<Response>(`branches/${branchIdToMove}/move-to/${newParentBranchId}`);

        if (!resp.success) {
            toastService.showError(resp.message);
            return;
        }
    }
}

async function deleteNotes(branchIdsToDelete: string[], forceDeleteAllClones = false) {
    branchIdsToDelete = filterRootNote(branchIdsToDelete);

    if (branchIdsToDelete.length === 0) {
        return false;
    }

    let proceed, deleteAllClones, eraseNotes;

    if (utils.isMobile()) {
        proceed = true;
        deleteAllClones = false;
    }
    else {
        ({proceed, deleteAllClones, eraseNotes} = await new Promise<ResolveOptions>(res =>
            appContext.triggerCommand('showDeleteNotesDialog', {branchIdsToDelete, callback: res, forceDeleteAllClones})));
    }

    if (!proceed) {
        return false;
    }

    try {
        await activateParentNotePath();
    }
    catch (e) {
        console.error(e);
    }

    const taskId = utils.randomString(10);

    let counter = 0;

    for (const branchIdToDelete of branchIdsToDelete) {
        counter++;

        const last = counter === branchIdsToDelete.length;
        const query = `?taskId=${taskId}&eraseNotes=${eraseNotes ? 'true' : 'false'}&last=${last ? 'true' : 'false'}`;

        const branch = froca.getBranch(branchIdToDelete);

        if (deleteAllClones && branch) {
            await server.remove(`notes/${branch.noteId}${query}`);
        } else {
            await server.remove(`branches/${branchIdToDelete}${query}`);
        }
    }

    if (eraseNotes) {
        utils.reloadFrontendApp("erasing notes requires reload");
    }

    return true;
}

async function activateParentNotePath() {
    // this is not perfect, maybe we should find the next/previous sibling, but that's more complex
    const activeContext = appContext.tabManager.getActiveContext();
    const parentNotePathArr = activeContext.notePathArray.slice(0, -1);

    if (parentNotePathArr.length > 0) {
        activeContext.setNote(parentNotePathArr.join("/"));
    }
}

async function moveNodeUpInHierarchy(node: Node) {
    if (hoistedNoteService.isHoistedNode(node)
        || hoistedNoteService.isTopLevelNode(node)
        || node.getParent().data.noteType === 'search') {
        return;
    }

    const targetBranchId = node.getParent().data.branchId;
    const branchIdToMove = node.data.branchId;

    const resp = await server.put<Response>(`branches/${branchIdToMove}/move-after/${targetBranchId}`);

    if (!resp.success) {
        toastService.showError(resp.message);
        return;
    }

    if (!hoistedNoteService.isTopLevelNode(node) && node.getParent().getChildren().length <= 1) {
        node.getParent().folder = false;
        node.getParent().renderTitle();
    }
}

function filterSearchBranches(branchIds: string[]) {
    return branchIds.filter(branchId => !branchId.startsWith('virt-'));
}

function filterRootNote(branchIds: string[]) {
    const hoistedNoteId = hoistedNoteService.getHoistedNoteId();

    return branchIds.filter(branchId => {
        const branch = froca.getBranch(branchId);
        if (!branch) {
            return false;
        }

        return branch.noteId !== 'root'
            && branch.noteId !== hoistedNoteId;
    });
}

function makeToast(id: string, message: string): ToastOptions {
    return {
        id: id,
        title: t("branches.delete-status"),
        message: message,
        icon: "trash"
    };
}

ws.subscribeToMessages(async message => {
    if (message.taskType !== 'deleteNotes') {
        return;
    }

    if (message.type === 'taskError') {
        toastService.closePersistent(message.taskId);
        toastService.showError(message.message);
    } else if (message.type === 'taskProgressCount') {
        toastService.showPersistent(makeToast(message.taskId, t("branches.delete-notes-in-progress", { count: message.progressCount })));
    } else if (message.type === 'taskSucceeded') {
        const toast = makeToast(message.taskId, t("branches.delete-finished-successfully"));
        toast.closeAfter = 5000;

        toastService.showPersistent(toast);
    }
});

ws.subscribeToMessages(async message => {
    if (message.taskType !== 'undeleteNotes') {
        return;
    }

    if (message.type === 'taskError') {
        toastService.closePersistent(message.taskId);
        toastService.showError(message.message);
    } else if (message.type === 'taskProgressCount') {
        toastService.showPersistent(makeToast(message.taskId, t("branches.undeleting-notes-in-progress", { count: message.progressCount })));
    } else if (message.type === 'taskSucceeded') {
        const toast = makeToast(message.taskId, t("branches.undeleting-notes-finished-successfully"));
        toast.closeAfter = 5000;

        toastService.showPersistent(toast);
    }
});

async function cloneNoteToBranch(childNoteId: string, parentBranchId: string, prefix?: string) {
    const resp = await server.put<Response>(`notes/${childNoteId}/clone-to-branch/${parentBranchId}`, {
        prefix: prefix
    });

    if (!resp.success) {
        toastService.showError(resp.message);
    }
}

async function cloneNoteToParentNote(childNoteId: string, parentNoteId: string, prefix: string) {
    const resp = await server.put<Response>(`notes/${childNoteId}/clone-to-note/${parentNoteId}`, {
        prefix: prefix
    });

    if (!resp.success) {
        toastService.showError(resp.message);
    }
}

// beware that the first arg is noteId and the second is branchId!
async function cloneNoteAfter(noteId: string, afterBranchId: string) {
    const resp = await server.put<Response>(`notes/${noteId}/clone-after/${afterBranchId}`);

    if (!resp.success) {
        toastService.showError(resp.message);
    }
}

export default {
    moveBeforeBranch,
    moveAfterBranch,
    moveToParentNote,
    deleteNotes,
    moveNodeUpInHierarchy,
    cloneNoteAfter,
    cloneNoteToBranch,
    cloneNoteToParentNote,
};
