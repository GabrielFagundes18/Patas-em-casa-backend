const animalService = require('../services/animals/animal-service');
const adoptionRequestService = require('../services/adoptions/adoption-request-service');
const adoptionStepService = require('../services/content/adoption-step-service');
const dashboardService = require('../services/dashboard/dashboard-service');
const storyService = require('../services/stories/story-service');
const volunteerService = require('../services/volunteers/volunteer-service');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

exports.listAnimals = async (req, res, next) => {
  try {
    const { items, total } = await animalService.listPublicPage(req.query);
    const { page, pageSize } = parsePagination(req.query);
    return res.json(listResponse(items, total, page, pageSize));
  } catch (error) {
    return next(error);
  }
};

exports.getAnimal = async (req, res, next) => {
  try {
    return res.json(successResponse(await animalService.getPublicById(req.params.id)));
  } catch (error) {
    return next(error);
  }
};

exports.listStories = async (req, res, next) => {
  try {
    const { items, total } = await storyService.listPublished(req.query);
    const { page, pageSize } = parsePagination(req.query);
    return res.json(listResponse(items, total, page, pageSize));
  } catch (error) {
    return next(error);
  }
};

exports.listAdoptionSteps = async (req, res, next) => {
  try {
    return res.json(successResponse(await adoptionStepService.listActive()));
  } catch (error) {
    return next(error);
  }
};

exports.createAdoptionRequest = async (req, res, next) => {
  try {
    return res.status(201).json(successResponse(await adoptionRequestService.create(req.body)));
  } catch (error) {
    return next(error);
  }
};

exports.applyAsVolunteer = async (req, res, next) => {
  try {
    return res.status(201).json(successResponse(await volunteerService.apply(req.body)));
  } catch (error) {
    return next(error);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    return res.json(successResponse(await dashboardService.publicStats()));
  } catch (error) {
    return next(error);
  }
};
