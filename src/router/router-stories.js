const express = require('express');
const ControllerStories = require('../controller/controller-stories');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validateRequest = require('../middleware/validate-request');
const { validateIdParam } = require('../validators/common-validators');
const {
  validateCreateStory,
  validateListStories,
  validateUpdateStory,
} = require('../validators/stories/story-validators');

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('stories:read'), validateRequest(validateListStories), asyncHandler(ControllerStories.list));
router.get('/:id', requirePermission('stories:read'), validateRequest(validateIdParam), asyncHandler(ControllerStories.getById));
router.post('/', requirePermission('stories:create'), validateRequest(validateCreateStory), asyncHandler(ControllerStories.create));
router.patch('/:id', requirePermission('stories:update'), validateRequest(validateIdParam), validateRequest(validateUpdateStory), asyncHandler(ControllerStories.update));
router.delete('/:id', requirePermission('stories:delete'), validateRequest(validateIdParam), asyncHandler(ControllerStories.remove));

module.exports = router;
